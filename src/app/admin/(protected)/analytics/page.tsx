// src/app/admin/(protected)/analytics/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { BarChart } from '@/components/dashboard/BarChart';
import { Ticket } from '@/components/ui/Ticket';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPrice } from '@/lib/currency';
import styles from './page.module.css';

interface AnalyticsData {
  bookingsTimeline: Array<{ day: string; bookings: number }>;
  signupsTimeline: Array<{ day: string; tenants: number; customers: number }>;
  topTenants: Array<{ name: string; count: number }>;
  revenue: Array<{ currency: string; total: number }>;
  totalBookings: number;
  newTenants: number;
  newCustomers: number;
  days: number;
}

export default function PlatformAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch(`/api/platform/analytics?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [days]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Analytics</h1>
        <select className={styles.rangeSelect} value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
        </select>
      </div>

      {data === null ? (
        <SkeletonLines count={6} />
      ) : (
        <>
          <div className={styles.statRow}>
            <Ticket className={styles.stat}>
              <p className={styles.statValue}>{data.totalBookings}</p>
              <p className={styles.statLabel}>Bookings</p>
            </Ticket>
            <Ticket className={styles.stat}>
              <p className={styles.statValue}>{data.newTenants}</p>
              <p className={styles.statLabel}>New tenants</p>
            </Ticket>
            <Ticket className={styles.stat}>
              <p className={styles.statValue}>{data.newCustomers}</p>
              <p className={styles.statLabel}>New customers</p>
            </Ticket>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Revenue (completed)</h2>
            {/* One card per currency — tenants set their own currency
                (see lib/currency.ts), so a single merged total would add
                incompatible currencies together. */}
            {data.revenue.length === 0 ? (
              <EmptyState title="No completed appointments with revenue in this window" />
            ) : (
              <div className={styles.statRow}>
                {data.revenue.map((r) => (
                  <Ticket key={r.currency} className={styles.stat}>
                    <p className={styles.statValue}>{formatPrice(r.total, r.currency)}</p>
                    <p className={styles.statLabel}>{r.currency}</p>
                  </Ticket>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Bookings by day</h2>
            {data.bookingsTimeline.length === 0 ? (
              <EmptyState title="No bookings in this window" />
            ) : (
              <BarChart data={data.bookingsTimeline} valueKey="bookings" labelKey="day" />
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>New tenants by day</h2>
            {data.signupsTimeline.length === 0 ? (
              <EmptyState title="No signups in this window" />
            ) : (
              <BarChart data={data.signupsTimeline} valueKey="tenants" labelKey="day" />
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Busiest tenants</h2>
            {data.topTenants.length === 0 ? (
              <EmptyState title="No data yet" />
            ) : (
              <ol className={styles.rankList}>
                {data.topTenants.map((t) => (
                  <li key={t.name} className={styles.rankRow}>
                    <span>{t.name}</span>
                    <span className={styles.mono}>{t.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
