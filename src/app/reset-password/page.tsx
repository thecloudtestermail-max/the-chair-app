// src/app/reset-password/page.tsx
//
// Where the emailed "Choose a new password" link lands. The one-time token
// arrives in the URL fragment (#token=...), which browsers never send to the
// server, so it stays out of server logs and Referer headers. It is read
// here, removed from the address bar, and sent only to /api/auth/reset.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket } from '@/components/ui/Ticket';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import styles from '@/components/auth/AuthPage.module.css';

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = still reading
  const [from, setFrom] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    setToken(params.get('token'));
    setFrom(params.get('from'));
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const signInHref = from ? `/t/${from}/login` : '/login';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError("The two passwords don't match"); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDone(true);
      else setError(data.message || 'Could not reset your password');
    } catch {
      setError('Could not reset your password. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <Ticket className={styles.ticket}>
        <p className={styles.eyebrow}>The Chair App</p>
        <h1 className={styles.heading}>Choose a new password</h1>

        {token === undefined ? null : done ? (
          <>
            <p className={styles.ok} role="status">Your password has been updated. You can sign in now.</p>
            <Link href={signInHref}><Button fullWidth>Go to sign in</Button></Link>
          </>
        ) : !token ? (
          <>
            <p className={styles.error} role="alert">This reset link is missing or incomplete. Open the link from your email again, or ask for a new one.</p>
            <Link href={signInHref} className={styles.backLink}>Back to sign in</Link>
          </>
        ) : (
          <>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <form onSubmit={submit} className={styles.form}>
              <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" autoFocus hint="At least 8 characters." />
              <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
              <Button type="submit" loading={submitting} fullWidth>Save new password</Button>
            </form>
          </>
        )}
      </Ticket>
    </div>
  );
}
