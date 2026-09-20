// src/app/admin/(protected)/moderation/page.tsx
//
// Platform-wide review queue. Defaults to flagged-only (the actual queue);
// a filter lets you browse everything for spot-checks. Approve clears the
// flag; delete removes the review outright — both are logged to the audit
// trail (api/platform/moderation/reviews).
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import styles from './page.module.css';

interface ReviewRow {
  _id: string;
  rating: number;
  text?: string;
  status: 'visible' | 'flagged';
  createdAt: string;
  tenantName?: string;
  tenantSlug?: string;
  customerName?: string;
  barberName?: string;
}

export default function ModerationPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<'flagged' | 'all' | 'visible'>('flagged');
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setReviews(null);
    fetch(`/api/platform/moderation/reviews?status=${filter}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setReviews);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (r: ReviewRow) => {
    setBusyId(r._id);
    try {
      const res = await fetch('/api/platform/moderation/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r._id, status: 'visible' }),
      });
      if (res.ok) {
        toast.show('Review approved', 'success');
        load();
      } else {
        toast.show('Failed to approve review', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: ReviewRow) => {
    if (!confirm('Delete this review permanently?')) return;
    setBusyId(r._id);
    try {
      const res = await fetch(`/api/platform/moderation/reviews?id=${r._id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.show('Review deleted', 'success');
        load();
      } else {
        toast.show('Failed to delete review', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Moderation</h1>
        <select className={styles.filterSelect} value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="flagged">Flagged</option>
          <option value="visible">Visible</option>
          <option value="all">All reviews</option>
        </select>
      </div>

      {reviews === null ? (
        <SkeletonLines count={4} />
      ) : reviews.length === 0 ? (
        <EmptyState title={filter === 'flagged' ? 'Nothing flagged right now' : 'No reviews to show'} />
      ) : (
        <div className={styles.list}>
          {reviews.map((r) => (
            <div key={r._id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.stars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  <span className={styles.meta}>
                    {' '}
                    · {r.tenantName || 'Unknown salon'} (/t/{r.tenantSlug}){r.barberName ? ` · ${r.barberName}` : ''}
                  </span>
                </div>
                <Badge tone={r.status === 'visible' ? 'confirmed' : 'pending'}>{r.status}</Badge>
              </div>
              {r.text && <p className={styles.text}>"{r.text}"</p>}
              <p className={styles.meta}>
                {r.customerName || 'Anonymous'} · {new Date(r.createdAt).toLocaleDateString()}
              </p>
              <div className={styles.actions}>
                {r.status === 'flagged' && (
                  <button className={styles.textButton} disabled={busyId === r._id} onClick={() => approve(r)}>
                    Approve
                  </button>
                )}
                <button className={styles.textButtonDanger} disabled={busyId === r._id} onClick={() => remove(r)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
