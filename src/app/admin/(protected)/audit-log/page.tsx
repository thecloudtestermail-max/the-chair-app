// src/app/admin/(protected)/audit-log/page.tsx
//
// Filterable, paginated viewer over every mutating action taken through
// this console. Renders `meta` as a compact inline JSON snippet rather
// than a bespoke summary per action — the action set here is deliberately
// still growing (moderation, admins, tenants, staff), and a generic
// renderer stays correct without a matching update every time a new
// action is added elsewhere.
'use client';

import { useEffect, useState, useCallback } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import styles from './page.module.css';

interface AuditEntry {
  _id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

const TARGET_TYPES = ['tenant', 'staff', 'admin', 'review', 'post', 'comment', 'session'];

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setEntries(null);
    const params = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (targetType) params.set('targetType', targetType);
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/platform/audit-log?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setEntries(data.entries);
        setTotal(data.total);
        setPageCount(data.pageCount);
      });
  }, [page, targetType, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div>
      <h1 className={styles.heading}>Audit log{total > 0 && <span className={styles.count}> ({total})</span>}</h1>

      <div className={styles.filters}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search by actor or action…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className={styles.filterSelect}
          value={targetType}
          onChange={(e) => {
            setPage(1);
            setTargetType(e.target.value);
          }}
        >
          <option value="">All types</option>
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {entries === null ? (
        <SkeletonLines count={6} />
      ) : entries.length === 0 ? (
        <EmptyState title="No matching entries" />
      ) : (
        <>
          <div className={styles.list}>
            {entries.map((e) => (
              <div key={e._id} className={styles.row}>
                <div className={styles.rowHeader}>
                  <span className={styles.action}>{e.action}</span>
                  <span className={styles.timestamp}>{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <p className={styles.actorLine}>
                  {e.actorEmail} · <span className={styles.targetType}>{e.targetType}</span>
                </p>
                {e.meta && Object.keys(e.meta).length > 0 && <pre className={styles.meta}>{JSON.stringify(e.meta, null, 2)}</pre>}
              </div>
            ))}
          </div>

          {pageCount > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Previous
              </button>
              <span className={styles.pageLabel}>
                Page {page} of {pageCount}
              </span>
              <button className={styles.pageButton} disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
