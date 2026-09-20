// src/app/admin/login/page.tsx
//
// Rebuilt for the Priority 4 design-system migration (FIX_PLAN.md), same
// treatment as the tenant staff login page, using the --pine palette that
// marks the rest of the platform-admin surface (see
// admin/(protected)/layout.tsx's header).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ticket } from '@/components/ui/Ticket';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // The platform admin has its own door: the public sign-in refuses this account.
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push('/admin');
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

  return (
    <div className={styles.wrap}>
      <Ticket className={styles.ticket}>
        <p className={styles.eyebrow}>Platform Admin</p>
        <h1 className={styles.heading}>Sign in</h1>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className={styles.form}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <Button type="submit" loading={submitting} fullWidth>
            Log in
          </Button>
        </form>
        <Link href="/" className={styles.backLink}>
          ← Back to The Chair App
        </Link>
      </Ticket>
    </div>
  );
}
