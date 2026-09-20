// src/app/admin/(protected)/tenants/[tenantId]/page.tsx
//
// One tenant's full admin view: editable profile fields, a stats snapshot,
// its staff roster, and a danger zone. Suspend/reactivate is one click;
// delete requires the tenant to already be suspended AND the caller to
// type the tenant's own slug back — see api/platform/tenants/[tenantId]
// for why (a ten-collection cascade with no undo).
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Ticket } from '@/components/ui/Ticket';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import styles from './page.module.css';

interface Tenant {
  _id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  contactEmail: string;
  branding: { primaryColor: string };
  createdAt: string;
}

interface Stats {
  staffCount: number;
  appointmentCount: number;
  appointment30dCount: number;
  barberCount: number;
  serviceCount: number;
  reviewCount: number;
  avgRating: number | null;
}

interface StaffMember {
  _id: string;
  username: string;
  email: string;
  role: string;
  mustChangePassword?: boolean;
}

export default function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const router = useRouter();
  const toast = useToast();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [form, setForm] = useState({ name: '', contactEmail: '', primaryColor: '' });
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/platform/tenants/${tenantId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setTenant(data.tenant);
        setStats(data.stats);
        setForm({ name: data.tenant.name, contactEmail: data.tenant.contactEmail, primaryColor: data.tenant.branding?.primaryColor || '#2563eb' });
      });
    fetch(`/api/platform/tenants/${tenantId}/staff`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setStaff);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.show('Tenant updated', 'success');
        setTenant(data);
      } else {
        toast.show(data.message || 'Failed to update tenant', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!tenant) return;
    const next = tenant.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`Suspend ${tenant.name}? Staff and customers won't be able to sign in or book until it's reactivated.`)) return;
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.show(next === 'suspended' ? 'Tenant suspended' : 'Tenant reactivated', 'success');
        setTenant(data);
      } else {
        toast.show(data.message || 'Failed to update status', 'error');
      }
    } finally {
      setStatusBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!tenant) return;
    if (!confirm(`Permanently delete ${tenant.name} and everything in it? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmSlug }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.show('Tenant deleted', 'success');
        router.push('/admin/tenants');
      } else {
        toast.show(data.message || 'Failed to delete tenant', 'error');
      }
    } finally {
      setDeleting(false);
    }
  };

  if (tenant === null) {
    return <SkeletonLines count={6} />;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <Link href="/admin/tenants" className={styles.backLink}>
            ← All tenants
          </Link>
          <h1 className={styles.heading}>{tenant.name}</h1>
          <p className={styles.meta}>
            /t/{tenant.slug} · created {new Date(tenant.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge tone={tenant.status === 'active' ? 'confirmed' : 'cancelled'}>{tenant.status}</Badge>
      </div>

      {stats && (
        <div className={styles.statGrid}>
          <Ticket className={styles.stat}>
            <p className={styles.statValue}>{stats.staffCount}</p>
            <p className={styles.statLabel}>Staff</p>
          </Ticket>
          <Ticket className={styles.stat}>
            <p className={styles.statValue}>{stats.appointmentCount}</p>
            <p className={styles.statLabel}>Appointments</p>
            <p className={styles.statSub}>{stats.appointment30dCount} in last 30 days</p>
          </Ticket>
          <Ticket className={styles.stat}>
            <p className={styles.statValue}>{stats.barberCount}</p>
            <p className={styles.statLabel}>Barbers</p>
          </Ticket>
          <Ticket className={styles.stat}>
            <p className={styles.statValue}>{stats.serviceCount}</p>
            <p className={styles.statLabel}>Services</p>
          </Ticket>
          <Ticket className={styles.stat}>
            <p className={styles.statValue}>{stats.avgRating ?? '—'}</p>
            <p className={styles.statLabel}>Avg rating</p>
            <p className={styles.statSub}>{stats.reviewCount} reviews</p>
          </Ticket>
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        <form onSubmit={handleSave} className={styles.form}>
          <Input label="Salon name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <Input
            label="Contact email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
            required
          />
          <div className={styles.colorField}>
            <label className={styles.colorLabel}>Brand color</label>
            <div className={styles.colorRow}>
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                className={styles.colorSwatch}
              />
              <span className={styles.colorValue}>{form.primaryColor}</span>
            </div>
          </div>
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Staff ({staff?.length ?? '…'})</h2>
        {staff === null ? (
          <SkeletonLines count={2} />
        ) : staff.length === 0 ? (
          <EmptyState title="No staff accounts yet" />
        ) : (
          <div className={styles.list}>
            {staff.map((s) => (
              <div key={s._id} className={styles.staffRow}>
                <div>
                  <strong>{s.username}</strong>
                  <p className={styles.meta}>{s.email}</p>
                </div>
                <div className={styles.staffTags}>
                  <span className={styles.roleTag}>{s.role}</span>
                  {s.mustChangePassword && <Badge tone="pending">Pending first login</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className={styles.staffHint}>
          To reissue a password or remove access, use <Link href={`/admin/staff?tenant=${tenant.slug}`}>Staff</Link>.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Access</h2>
        <p className={styles.meta}>
          {tenant.status === 'active'
            ? 'Staff and customers can sign in and book normally.'
            : 'Sign-in and booking are blocked for everyone at this salon.'}
        </p>
        <Button variant={tenant.status === 'active' ? 'secondary' : 'primary'} loading={statusBusy} onClick={toggleStatus}>
          {tenant.status === 'active' ? 'Suspend tenant' : 'Reactivate tenant'}
        </Button>
      </section>

      <section className={[styles.section, styles.dangerZone].join(' ')}>
        <h2 className={styles.sectionTitle}>Danger zone</h2>
        <p className={styles.meta}>
          Permanently deletes this tenant and everything in it — staff, barbers, services, appointments, reviews, posts.
          This cannot be undone. The tenant must be suspended first.
        </p>
        <Input
          label={`Type "${tenant.slug}" to confirm`}
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          disabled={tenant.status !== 'suspended'}
        />
        <Button
          variant="danger"
          loading={deleting}
          disabled={tenant.status !== 'suspended' || confirmSlug !== tenant.slug}
          onClick={handleDelete}
        >
          Delete tenant permanently
        </Button>
      </section>
    </div>
  );
}
