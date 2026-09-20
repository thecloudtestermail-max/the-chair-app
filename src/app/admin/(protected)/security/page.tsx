// src/app/admin/(protected)/security/page.tsx
//
// Two tools: a read-only view of failed sign-in attempts against the
// platform-admin door specifically (not tenant staff/customer logins —
// those have their own tenant-scoped surfaces), and a force-revoke for
// any account's active sessions, addressable directly by email so it
// doesn't require finding the account in the staff directory first.
'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import styles from './page.module.css';

interface LoginAttemptGroup {
  email: string;
  ip: string;
  count: number;
  firstAttempt: string;
  lastAttempt: string;
}

export default function SecurityPage() {
  const toast = useToast();
  const [attempts, setAttempts] = useState<LoginAttemptGroup[] | null>(null);
  const [revokeEmail, setRevokeEmail] = useState('');
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    fetch('/api/platform/security/login-attempts')
      .then((r) => (r.ok ? r.json() : []))
      .then(setAttempts);
  }, []);

  const revoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`Sign out every active session for ${revokeEmail}?`)) return;
    setRevoking(true);
    try {
      const res = await fetch('/api/platform/security/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: revokeEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.show(`Signed out ${data.accountsAffected} account(s)`, 'success');
        setRevokeEmail('');
      } else {
        toast.show(data.message || 'Failed to revoke sessions', 'error');
      }
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div>
      <h1 className={styles.heading}>Security</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Force sign-out</h2>
        <p className={styles.meta}>Ends every active staff/admin session for an account immediately — no password change needed.</p>
        <form onSubmit={revoke} className={styles.revokeForm}>
          <Input label="Account email" type="email" value={revokeEmail} onChange={(e) => setRevokeEmail(e.target.value)} required />
          <Button type="submit" variant="danger" loading={revoking}>
            Sign out everywhere
          </Button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Failed admin sign-ins (last 7 days)</h2>
        <p className={styles.meta}>Grouped by account + IP. A large count against one account is worth a closer look.</p>
        {attempts === null ? (
          <SkeletonLines count={3} />
        ) : attempts.length === 0 ? (
          <EmptyState title="No failed admin sign-ins recorded" />
        ) : (
          <div className={styles.list}>
            {attempts.map((a, i) => (
              <div key={i} className={styles.row}>
                <div>
                  <strong>{a.email}</strong>
                  <p className={styles.meta}>
                    from {a.ip} · last attempt {new Date(a.lastAttempt).toLocaleString()}
                  </p>
                </div>
                <span className={a.count >= 5 ? styles.countHigh : styles.count}>{a.count}×</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
