// src/app/t/[tenantSlug]/dashboard/analytics/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { BarChart } from '@/components/dashboard/BarChart';
import { Ticket } from '@/components/ui/Ticket';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRole } from '@/hooks/useRole';
import { useCurrency } from '@/hooks/useCurrency';
import { formatPrice } from '@/lib/currency';
import styles from './page.module.css';

interface AnalyticsData {
  timeline: Array<{ day: string; bookings: number; revenue: number }>;
  topBarbers: Array<{ name: string; count: number }>;
  topServices: Array<{ name: string; count: number }>;
  totalRevenue: number;
  totalBookings: number;
  days: number;
}

export default function AnalyticsPage() {
  const role = useRole();
  const allowed = role === 'admin';
  const currency = useCurrency();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!allowed) return;
    fetch(`/api/analytics?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [allowed, days]);

  if (!allowed) {
    return <EmptyState title="You don't have access to this page" description="Analytics is only available to admins." />;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Analytics</h1>
        <select className={styles.rangeSelect} value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
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
              <p className={styles.statValue}>{formatPrice(data.totalRevenue, currency)}</p>
              <p className={styles.statLabel}>Revenue (completed)</p>
            </Ticket>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Bookings by day</h2>
            {data.timeline.length === 0 ? (
              <EmptyState title="No bookings in this window" />
            ) : (
              <BarChart data={data.timeline} valueKey="bookings" labelKey="day" formatValue={(v) => String(v)} />
            )}
          </section>

          <div className={styles.twoCol}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Busiest barbers</h2>
              {data.topBarbers.length === 0 ? (
                <EmptyState title="No data yet" />
              ) : (
                <ol className={styles.rankList}>
                  {data.topBarbers.map((b) => (
                    <li key={b.name} className={styles.rankRow}>
                      <span>{b.name}</span>
                      <span className={styles.mono}>{b.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Popular services</h2>
              {data.topServices.length === 0 ? (
                <EmptyState title="No data yet" />
              ) : (
                <ol className={styles.rankList}>
                  {data.topServices.map((s) => (
                    <li key={s.name} className={styles.rankRow}>
                      <span>{s.name}</span>
                      <span className={styles.mono}>{s.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
