// src/components/auth/AccountPanel.tsx
//
// "My account" for everyone, in three places: /account (Chair App customers),
// /t/[slug]/account (customers inside a salon) and /t/[slug]/dashboard/account
// (staff). Customers can edit their name and phone; everyone can change their
// password and sign out. Email is your identity, so it is shown but not editable.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ChangePasswordForm } from './ChangePasswordForm';
import styles from './AccountPanel.module.css';

const ROLE_LABEL: Record<string, string> = { admin: 'Salon owner', receptionist: 'Receptionist', barber: 'Barber' };

interface CustomerProfile { name: string; email: string; phone: string }

export function AccountPanel({ kind, tenantSlug }: { kind: 'customer' | 'staff'; tenantSlug?: string }) {
  const [state, setState] = useState<'loading' | 'signedOut' | 'ready'>('loading');
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [role, setRole] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = kind === 'customer' ? '/api/customer-auth/me' : '/api/auth/verify';
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data) { setState('signedOut'); return; }
        if (kind === 'customer') { setProfile(data); setName(data.name); setPhone(data.phone || ''); }
        else setRole(data.role);
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('signedOut'); });
    return () => { cancelled = true; };
  }, [kind]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch('/api/customer-auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setProfile(data); setSaveMsg({ ok: true, text: 'Saved' }); }
      else setSaveMsg({ ok: false, text: data.message || 'Could not save' });
    } catch {
      setSaveMsg({ ok: false, text: 'Could not save. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = tenantSlug ? `/t/${tenantSlug}` : '/';
  };

  if (state === 'loading') return <p className={styles.muted}>Loading…</p>;
  if (state === 'signedOut') {
    const loginHref = tenantSlug ? `/t/${tenantSlug}/login` : '/login';
    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>My account</h1>
        <p className={styles.muted}>Sign in to see your account.</p>
        <Link href={loginHref}><Button>Sign in</Button></Link>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>My account</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your details</h2>
        {kind === 'customer' && profile ? (
          <form onSubmit={saveProfile} className={styles.form}>
            <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            <Input label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" />
            <Input label="Email" value={profile.email} readOnly hint="Your email is your sign-in, so it can't be changed here." />
            {saveMsg && <p className={saveMsg.ok ? styles.ok : styles.error} role={saveMsg.ok ? 'status' : 'alert'}>{saveMsg.text}</p>}
            <Button type="submit" loading={saving}>Save details</Button>
          </form>
        ) : (
          <p className={styles.muted}>You're signed in as <strong>{ROLE_LABEL[role] || role}</strong>. Your salon owner manages your name and role.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Change password</h2>
        <ChangePasswordForm />
      </section>

      <section className={styles.section}>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </section>
    </div>
  );
}
