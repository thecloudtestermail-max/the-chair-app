// src/app/t/[tenantSlug]/dashboard/reviews/page.tsx
//
// Closes FIX_PLAN.md Priority 5: Review.status has existed since Part 2
// but nothing ever set or read 'flagged' except the public page's hardcoded
// 'visible' filter. This gives staff a way to act on it.
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useRole } from '@/hooks/useRole';
import styles from './page.module.css';

interface Review {
  _id: string;
  customerName?: string;
  barberName?: string;
  rating: number;
  text?: string;
  status: 'visible' | 'flagged';
  createdAt: string;
}

export default function ReviewsPage() {
  const role = useRole();
  const allowed = role === 'admin';
  const toast = useToast();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [query, setQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = () => fetch('/api/reviews').then((r) => (r.ok ? r.json() : [])).then(setReviews);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  if (!allowed) {
    return <EmptyState title="You don't have access to this page" description="Review moderation is only available to admins." />;
  }

  const filtered = useMemo(() => {
    if (!reviews) return [];
    const q = query.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter(
      (r) => r.customerName?.toLowerCase().includes(q) || r.barberName?.toLowerCase().includes(q) || r.text?.toLowerCase().includes(q)
    );
  }, [reviews, query]);

  const toggleStatus = async (review: Review) => {
    const nextStatus = review.status === 'visible' ? 'flagged' : 'visible';
    setUpdatingId(review._id);
    try {
      const res = await fetch('/api/reviews', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: review._id, status: nextStatus }),
      });
      if (res.ok) {
        toast.show(nextStatus === 'flagged' ? 'Review flagged' : 'Review unflagged', 'success');
        setReviews((prev) => (prev ? prev.map((r) => (r._id === review._id ? { ...r, status: nextStatus } : r)) : prev));
      } else {
        const data = await res.json();
        toast.show(data.message || 'Failed to update review', 'error');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Reviews</h1>
        <input
          className={styles.search}
          placeholder="Search by customer, barber, or review text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search reviews"
        />
      </div>

      {reviews === null ? (
        <SkeletonLines count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query ? 'No matches' : 'No reviews yet'}
          description={query ? 'Try a different search.' : 'Reviews appear here once a customer reviews a completed appointment.'}
        />
      ) : (
        <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Barber</th>
              <th>Rating</th>
              <th>Review</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r._id}>
                <td className={styles.nameCell}>{r.customerName || '—'}</td>
                <td>{r.barberName || '—'}</td>
                <td className={styles.mono}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</td>
                <td className={styles.textCell}>{r.text || <span className={styles.noText}>No written review</span>}</td>
                <td>
                  <Badge tone={r.status === 'visible' ? 'confirmed' : 'cancelled'}>{r.status === 'visible' ? 'Visible' : 'Flagged'}</Badge>
                </td>
                <td>
                  <Button variant={r.status === 'visible' ? 'danger' : 'secondary'} size="sm" loading={updatingId === r._id} onClick={() => toggleStatus(r)}>
                    {r.status === 'visible' ? 'Flag' : 'Unflag'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
