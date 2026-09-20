// src/app/admin/(protected)/admins/page.tsx
//
// Managing other super_admin accounts. Guarded server-side against
// self-removal and removing the last admin (api/platform/admins) — the
// remove button here is disabled for your own row as a first line of
// defense, but the real guard is the API's.
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import styles from './page.module.css';

interface Admin {
  _id: string;
  username: string;
  email: string;
  isSelf: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
}

export default function AdminsPage() {
  const toast = useToast();
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ username: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ username: string; email: string; tempPassword: string; expiresAt: string; emailed: boolean } | null>(null);

  const load = () => fetch('/api/platform/admins').then((r) => (r.ok ? r.json() : [])).then(setAdmins);

  useEffect(() => {
    load();
  }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/platform/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setModalOpen(false);
        setCredentials({ username: form.username, email: data.email, tempPassword: data.tempPassword, expiresAt: data.tempPasswordExpiresAt, emailed: !!data.emailed });
        setForm({ username: '', email: '' });
        load();
      } else {
        toast.show(data.message || 'Failed to add admin', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Admin) => {
    if (!confirm(`Remove ${a.username}'s platform admin access? This can't be undone.`)) return;
    setBusyId(a._id);
    try {
      const res = await fetch(`/api/platform/admins/${a._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.show('Admin removed', 'success');
        load();
      } else {
        toast.show(data.message || 'Could not remove admin', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const copyPassword = () => {
    if (!credentials) return;
    navigator.clipboard?.writeText(credentials.tempPassword).then(() => toast.show('Password copied', 'success'));
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Platform admins</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          Add admin
        </Button>
      </div>

      {admins === null ? (
        <SkeletonLines count={3} />
      ) : admins.length === 0 ? (
        <EmptyState title="No admins found" />
      ) : (
        <div className={styles.list}>
          {admins.map((a) => (
            <div key={a._id} className={styles.row}>
              <div>
                <strong>
                  {a.username} {a.isSelf && <span className={styles.youTag}>(you)</span>}
                </strong>
                <p className={styles.meta}>{a.email}</p>
              </div>
              <div className={styles.rowActions}>
                {a.mustChangePassword && <Badge tone="pending">Pending first login</Badge>}
                <button className={styles.textButtonDanger} disabled={a.isSelf || busyId === a._id} onClick={() => remove(a)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add platform admin">
        <form onSubmit={invite} className={styles.form}>
          <Input label="Name" required autoFocus value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <p className={styles.formHint}>They'll get full platform-admin access — every tenant, every tool on this console.</p>
          <Button type="submit" loading={saving} fullWidth>
            Create admin account
          </Button>
        </form>
      </Modal>

      <Modal open={!!credentials} onClose={() => setCredentials(null)} title="Admin account created">
        {credentials && (
          <>
            <p className={styles.codeIntro}>
              <strong>{credentials.username}</strong> can sign in now at /admin/login with their email and the temporary password below.
              {credentials.emailed ? ' We also emailed them where to sign in.' : " Email isn't set up, so nothing was sent automatically."}
            </p>
            <div className={styles.credRow}>
              <span className={styles.credLabel}>Email</span>
              <span className={styles.credValue}>{credentials.email}</span>
            </div>
            <div className={styles.credRow}>
              <span className={styles.credLabel}>Password</span>
              <span className={styles.codeBlock}>{credentials.tempPassword}</span>
            </div>
            <p className={styles.codeNote}>
              They'll choose their own password at first sign-in; this one works until {new Date(credentials.expiresAt).toLocaleDateString()}. It is shown only now.
            </p>
            <Button fullWidth onClick={copyPassword}>
              Copy password
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
