// src/app/admin/(protected)/staff/page.tsx
//
// Cross-tenant staff search + password reissue — the support tool for
// "I'm locked out" without needing to know which salon first. Reissuing
// mirrors the tenant dashboard's own staff page (same welcome-guide modal),
// but works for ANY role at ANY tenant, since a salon's own admin can't
// reissue their own access if they're the one locked out.
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { downloadBase64Pdf, pdfFilename } from '@/lib/downloadPdf';
import styles from './page.module.css';

interface StaffResult {
  _id: string;
  username: string;
  email: string;
  role: string;
  tenantName?: string;
  tenantSlug?: string;
  mustChangePassword?: boolean;
  tempPasswordExpiresAt?: string;
}

function StaffDirectory() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const [q, setQ] = useState(searchParams.get('tenant') || '');
  const [results, setResults] = useState<StaffResult[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [access, setAccess] = useState<{ name: string; email: string; tempPassword: string; expiresAt?: string; pdf: string | null; emailed: boolean } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    const t = setTimeout(() => {
      fetch(`/api/platform/staff?${params}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setResults);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const reissue = async (s: StaffResult) => {
    if (!confirm(`Give ${s.username} a new temporary password? Their current password will stop working and they'll be signed out everywhere.`)) return;
    setBusyId(s._id);
    try {
      const res = await fetch(`/api/platform/staff/${s._id}/reissue-password`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setAccess({ name: s.username, email: s.email, tempPassword: data.tempPassword, expiresAt: data.tempPasswordExpiresAt, pdf: data.welcomePdf, emailed: !!data.emailed });
      } else {
        toast.show(data.message || 'Failed to reissue access', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const copyPassword = () => {
    if (!access) return;
    navigator.clipboard?.writeText(access.tempPassword).then(() => toast.show('Password copied', 'success'));
  };

  return (
    <div>
      <h1 className={styles.heading}>Staff directory</h1>
      <input
        className={styles.search}
        type="search"
        placeholder="Search by name, email, or salon…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />

      {results === null ? (
        <SkeletonLines count={4} />
      ) : results.length === 0 ? (
        <EmptyState title={q ? 'No staff match your search' : 'Start typing to search'} />
      ) : (
        <div className={styles.list}>
          {results.map((s) => (
            <div key={s._id} className={styles.row}>
              <div className={styles.rowBody}>
                <p className={styles.name}>{s.username}</p>
                <p className={styles.meta}>
                  {s.email} · <span className={styles.roleTag}>{s.role}</span>
                  {s.tenantName && (
                    <>
                      {' '}
                      · {s.tenantName} (/t/{s.tenantSlug})
                    </>
                  )}
                </p>
              </div>
              {s.mustChangePassword && <Badge tone="pending">Pending first login</Badge>}
              <button className={styles.textButton} disabled={busyId === s._id} onClick={() => reissue(s)}>
                Reissue access
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!access} onClose={() => setAccess(null)} title="Welcome guide">
        {access && (
          <>
            <p className={styles.codeIntro}>
              <strong>{access.name}</strong> can sign in now with their email and the temporary password below. Download their welcome
              guide and hand it over.
              {access.emailed ? ' We also emailed them where to sign in.' : " Email isn't set up (or this is a platform admin), so nothing was sent automatically."}
            </p>
            <div className={styles.credRow}>
              <span className={styles.credLabel}>Email</span>
              <span className={styles.credValue}>{access.email}</span>
            </div>
            <div className={styles.credRow}>
              <span className={styles.credLabel}>Password</span>
              <span className={styles.codeBlock}>{access.tempPassword}</span>
            </div>
            <p className={styles.codeNote}>
              They'll be asked to choose their own password at first sign-in
              {access.expiresAt ? `; this one works until ${new Date(access.expiresAt).toLocaleDateString()}` : ''}. It is shown only now.
            </p>
            {access.pdf ? (
              <Button fullWidth onClick={() => downloadBase64Pdf(access.pdf!, pdfFilename('Welcome', access.name))}>
                Download welcome PDF
              </Button>
            ) : (
              <p className={styles.codeNote}>The PDF could not be generated this time. Copy the password below instead.</p>
            )}
            <Button fullWidth variant="secondary" onClick={copyPassword}>
              Copy password
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}

export default function StaffDirectoryPage() {
  return (
    <Suspense fallback={<SkeletonLines count={4} />}>
      <StaffDirectory />
    </Suspense>
  );
}
