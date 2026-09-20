// src/app/admin/(protected)/tenants/page.tsx
//
// Full tenant roster (moved off the /admin landing page): search by name/
// slug/email, filter by status, sort, paginate, and the tenant-creation
// form. Creating a tenant also produces the owner's welcome PDF (sign-in
// details on page 1, then an owner's guide and QR pages) — it exists only
// in the response to that request, so it's offered for download right away.
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { downloadBase64Pdf, pdfFilename } from '@/lib/downloadPdf';
import { CURRENCIES, DEFAULT_CURRENCY } from '@/lib/currency';
import styles from './page.module.css';

interface Tenant {
  _id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  contactEmail: string;
  currency: string;
  createdAt: string;
}

const emptyForm = { slug: '', name: '', contactEmail: '', adminEmail: '', adminPassword: '', currency: DEFAULT_CURRENCY };

export default function TenantsPage() {
  const toast = useToast();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'suspended'>('');
  const [sort, setSort] = useState<'createdAt' | 'name' | 'status'>('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; pdf: string | null } | null>(null);

  const load = useCallback(() => {
    setTenants(null);
    const params = new URLSearchParams({ page: String(page), pageSize: '20', sort, dir });
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    fetch(`/api/platform/tenants?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setTenants(data.tenants);
        setTotal(data.total);
        setPageCount(data.pageCount);
      });
  }, [q, status, sort, dir, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0); // debounce free-text search only
    return () => clearTimeout(t);
  }, [load, q]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.show('Tenant created', 'success');
        setCreateOpen(false);
        setCreated({ name: form.name, email: data.adminEmail || form.adminEmail, pdf: data.welcomePdf || null });
        setForm(emptyForm);
        setPage(1);
        load();
      } else {
        toast.show(data.message || 'Failed to create tenant', 'error');
      }
    } catch {
      toast.show('Failed to create tenant', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Tenants{total > 0 && <span className={styles.count}> ({total})</span>}</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          New tenant
        </Button>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search by name, slug, or email…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className={styles.filterSelect}
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as any);
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          className={styles.filterSelect}
          value={`${sort}:${dir}`}
          onChange={(e) => {
            const [s, d] = e.target.value.split(':');
            setSort(s as any);
            setDir(d as any);
          }}
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
        </select>
      </div>

      {tenants === null ? (
        <SkeletonLines count={5} />
      ) : tenants.length === 0 ? (
        <EmptyState
          title={q || status ? 'No tenants match your filters' : 'No tenants yet'}
          description={q || status ? undefined : 'Create the first one below.'}
        />
      ) : (
        <>
          <div className={styles.list}>
            {tenants.map((t) => (
              <Link key={t._id} href={`/admin/tenants/${t._id}`} className={styles.row}>
                <div>
                  <strong>{t.name}</strong>
                  <p className={styles.meta}>
                    /t/{t.slug} · {t.contactEmail}
                  </p>
                </div>
                <div className={styles.rowTags}>
                  <span className={styles.currencyTag}>{t.currency || 'ZAR'}</span>
                  <Badge tone={t.status === 'active' ? 'confirmed' : 'cancelled'}>{t.status}</Badge>
                </div>
              </Link>
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create tenant">
        <form onSubmit={handleSubmit} className={styles.form}>
          <Input
            label="Slug"
            name="slug"
            placeholder="e.g. acme-salon"
            value={form.slug}
            onChange={handleChange}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            hint="Lowercase letters, numbers and hyphens. Becomes the salon's web address and QR codes."
          />
          <Input label="Salon name" name="name" value={form.name} onChange={handleChange} required />
          <Input label="Contact email" name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} required />
          <Select label="Currency" name="currency" value={form.currency} onChange={handleChange} hint="What this salon charges and gets paid in. Can be changed later.">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input label="First admin email" name="adminEmail" type="email" value={form.adminEmail} onChange={handleChange} required />
          <Input
            label="First admin password"
            name="adminPassword"
            type="password"
            value={form.adminPassword}
            onChange={handleChange}
            required
            minLength={8}
            hint="A starting password: it is printed in the welcome PDF, and the owner is asked to choose their own the first time they sign in."
          />
          <Button type="submit" loading={submitting} fullWidth>
            Create tenant
          </Button>
        </form>
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} title="Tenant ready">
        {created && (
          <>
            <p className={styles.createdTitle}>
              <strong>{created.name}</strong> is ready.
            </p>
            {created.pdf ? (
              <>
                <p className={styles.meta}>
                  Download the owner's welcome PDF and send it to {created.email}. It has their sign-in details on page 1, so send it
                  privately. It is not stored anywhere, so download it now.
                </p>
                <Button fullWidth onClick={() => downloadBase64Pdf(created.pdf!, pdfFilename('Welcome', created.name))}>
                  Download welcome PDF
                </Button>
              </>
            ) : (
              <p className={styles.meta}>The salon was created, but the welcome PDF could not be generated. Give the owner the email and password you entered.</p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
