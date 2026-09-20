// src/components/auth/ChangePasswordForm.tsx
//
// Change your own password. Used on the Account pages and, in "forced" mode,
// as the only thing a new team member can see until they replace the
// temporary password from their welcome PDF.
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import styles from './AccountPanel.module.css';

export function ChangePasswordForm({ onChanged }: { onChanged?: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setDone(false);
    if (next !== confirm) { setError("The two new passwords don't match"); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message || 'Could not change your password'); return; }
      setDone(true); setCurrent(''); setNext(''); setConfirm('');
      onChanged?.();
    } catch {
      setError('Could not change your password. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {done && <p className={styles.ok} role="status">Password updated. Your other devices have been signed out.</p>}
      <Input label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      <Input label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" hint="At least 8 characters." />
      <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      <Button type="submit" loading={submitting}>Change password</Button>
    </form>
  );
}
