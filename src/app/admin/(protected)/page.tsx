// src/app/admin/(protected)/page.tsx
//
// Restyled for Part 2 Phase H: replaced the raw message.startsWith('✗')
// string-check pattern with Toast, and moved off inline styles onto the
// design system components.
//
// Creating a salon also produces the owner's welcome PDF (sign-in details on
// page 1, then an owner's guide and QR pages). It exists only in the response
// to that request, so it is offered for download straight away.
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { downloadBase64Pdf, pdfFilename } from '@/lib/downloadPdf';
import styles from './page.module.css';

interface Tenant {
  _id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  contactEmail: string;
}

export default function AdminHome() {
  const toast = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; pdf: string | null } | null>(null);

  const [form, setForm] = useState({
    slug: '',
    name: '',
    contactEmail: '',
    adminEmail: '',
    adminPassword: '',
  });

  const loadTenants = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/platform/tenants');
      if (res.ok) setTenants(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        toast.show('Tenant created', 'success');
        setCreated({ name: form.name, email: data.adminEmail || form.adminEmail, pdf: data.welcomePdf || null });
        setForm({ slug: '', name: '', contactEmail: '', adminEmail: '', adminPassword: '' });
        loadTenants();
      } else {
        const data = await res.json();
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
      <h1 className={styles.heading}>Tenants</h1>

      {loading ? (
        <SkeletonLines count={3} />
      ) : (
        <div className={styles.list}>
          {tenants.length === 0 && <EmptyState title="No tenants yet" description="Create the first one below." />}
          {tenants.map((t) => (
            <div key={t._id} className={styles.row}>
              <div>
                <strong>{t.name}</strong>
                <p className={styles.meta}>
                  /t/{t.slug} · {t.contactEmail}
                </p>
              </div>
              <Badge tone={t.status === 'active' ? 'confirmed' : 'cancelled'}>{t.status}</Badge>
            </div>
          ))}
        </div>
      )}

      {created && (
        <div className={styles.created} role="status">
          <p className={styles.createdTitle}><strong>{created.name}</strong> is ready.</p>
          {created.pdf ? (
            <>
              <p className={styles.meta}>
                Download the owner's welcome PDF and send it to {created.email}. It has their sign-in details on page 1, so send it privately. It is not stored anywhere, so download it now.
              </p>
              <Button onClick={() => downloadBase64Pdf(created.pdf!, pdfFilename('Welcome', created.name))}>Download welcome PDF</Button>
            </>
          ) : (
            <p className={styles.meta}>The salon was created, but the welcome PDF could not be generated. Give the owner the email and password you entered.</p>
          )}
        </div>
      )}

      <h2 className={styles.subheading}>Create tenant</h2>
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input label="Slug" name="slug" placeholder="e.g. acme-salon" value={form.slug} onChange={handleChange} required pattern="[a-z0-9]+(-[a-z0-9]+)*" hint="Lowercase letters, numbers and hyphens. It becomes the salon's web address and QR codes." />
        <Input label="Salon name" name="name" value={form.name} onChange={handleChange} required />
        <Input label="Contact email" name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} required />
        <Input label="First admin email" name="adminEmail" type="email" value={form.adminEmail} onChange={handleChange} required />
        <Input label="First admin password" name="adminPassword" type="password" value={form.adminPassword} onChange={handleChange} required minLength={8} hint="A starting password: it is printed in the welcome PDF, and the owner is asked to choose their own the first time they sign in." />
        <Button type="submit" loading={submitting}>
          Create tenant
        </Button>
      </form>
    </div>
  );
}
