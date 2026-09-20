// src/app/admin/(protected)/page.tsx
//
// Platform landing page: KPI cards, a 30-day signup trend, and the most
// recently created tenants. Tenant creation and the full tenant list moved
// to /admin/tenants — a landing page that tries to be both a dashboard and
// a creation form ends up doing neither well.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket } from '@/components/ui/Ticket';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { BarChart } from '@/components/dashboard/BarChart';
import styles from './page.module.css';

interface Overview {
  tenants: { total: number; active: number; suspended: number };
  totalStaff: number;
  totalCustomers: number;
  totalAppointments: number;
  appointments30d: number;
  recentTenants: Array<{ _id: string; name: string; slug: string; status: 'active' | 'suspended'; createdAt: string }>;
  signupTimeline: Array<{ day: string; count: number }>;
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    fetch('/api/platform/overview')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);

  return (
    <div>
      <h1 className={styles.heading}>Overview</h1>

      {data === null ? (
        <SkeletonLines count={6} />
      ) : (
        <>
          <div className={styles.statGrid}>
            <Ticket className={styles.stat}>
              <p className={styles.statValue}>{data.tenants.total}</p>
              <p className={styles.statLabel}>Tenants</p>
              <p className={styles.statSub}>
                {data.tenants.active} active · {data.tenants.suspended} suspended
              </p>
            </Ticket>
            <Ticket className={styles.stat}>
              <p className={styles.statValue}>{data.totalStaff}</p>
              <p className={styles.statLabel}>Staff accounts</p>
            </Ticket>
            <Ticket className={styles.stat}>
              <p className={styles.statValue}>{data.totalCustomers}</p>
              <p className={styles.statLabel}>Customers</p>
            </Ticket>
            <Ticket className={styles.stat}>
              <p className={styles.statValue}>{data.totalAppointments}</p>
              <p className={styles.statLabel}>Appointments</p>
              <p className={styles.statSub}>{data.appointments30d} in the last 30 days</p>
            </Ticket>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>New tenants (last 30 days)</h2>
            {data.signupTimeline.length === 0 ? (
              <EmptyState title="No new tenants in this window" />
            ) : (
              <BarChart data={data.signupTimeline} valueKey="count" labelKey="day" />
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Recently created</h2>
              <Link href="/admin/tenants" className={styles.viewAll}>
                View all tenants →
              </Link>
            </div>
            {data.recentTenants.length === 0 ? (
              <EmptyState
                title="No tenants yet"
                description="Create the first one to get started."
                action={
                  <Link href="/admin/tenants" className={styles.viewAll}>
                    Create a tenant →
                  </Link>
                }
              />
            ) : (
              <div className={styles.list}>
                {data.recentTenants.map((t) => (
                  <Link key={t._id} href={`/admin/tenants/${t._id}`} className={styles.row}>
                    <div>
                      <strong>{t.name}</strong>
                      <p className={styles.meta}>
                        /t/{t.slug} · created {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge tone={t.status === 'active' ? 'confirmed' : 'cancelled'}>{t.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
