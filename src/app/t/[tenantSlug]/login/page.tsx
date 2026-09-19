// src/app/t/[tenantSlug]/login/page.tsx
//
// Rebuilt for the Priority 4 design-system migration (FIX_PLAN.md) — this
// screen was the last one in the app still using raw inline styles and
// hardcoded light-only colors. Now uses Ticket/Input/Button and theme
// tokens, matching admin/(protected)/page.tsx's create-tenant form as the
// closest existing "form on its own page" reference.
//
// Nav-audit follow-up: added the "set up your account" mode for a staff
// member who was just invited by their admin (see dashboard/staff/) —
// previously nothing on this page acknowledged that invite codes existed
// at all, so an invited receptionist/barber had no page that knew what to
// do with the code they were handed.
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Ticket } from '@/components/ui/Ticket';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

export default function TenantLoginPage() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'accept'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: 'login' | 'accept') => {
    setMode(next);
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantSlug }),
      });

      if (res.ok) {
        router.push(`/t/${tenantSlug}/dashboard`);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.message || 'Login failed');
      }
    } catch {
      setError('Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/staff/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password: newPassword }),
      });

      if (res.ok) {
        router.push(`/t/${tenantSlug}/dashboard`);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.message || 'Could not activate your account');
      }
    } catch {
      setError('Could not activate your account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <Ticket className={styles.ticket}>
        <p className={styles.eyebrow}>Staff</p>
        <h1 className={styles.heading}>{mode === 'login' ? 'Sign in' : 'Set up your account'}</h1>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {mode === 'login' ? (
          <>
            <form onSubmit={handleLogin} className={styles.form}>
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
              <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              <Button type="submit" loading={submitting} fullWidth>
                Log in
              </Button>
            </form>
            <button type="button" className={styles.modeSwitch} onClick={() => switchMode('accept')}>
              Have a setup code?
            </button>
          </>
        ) : (
          <>
            <p className={styles.hint}>Your admin gave you an email and an 8-character code. Enter them here to choose your password.</p>
            <form onSubmit={handleAccept} className={styles.form}>
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
              <Input
                label="Setup code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                maxLength={8}
                autoComplete="off"
              />
              <Input
                label="Choose a password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                hint="At least 8 characters."
                autoComplete="new-password"
              />
              <Button type="submit" loading={submitting} fullWidth>
                Activate account
              </Button>
            </form>
            <button type="button" className={styles.modeSwitch} onClick={() => switchMode('login')}>
              Already have a password? Sign in
            </button>
          </>
        )}
      </Ticket>
    </div>
  );
}
