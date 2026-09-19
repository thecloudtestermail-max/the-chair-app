// src/components/CustomerSignInModal.tsx
'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function CustomerSignInModal({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn: () => void }) {
  const toast = useToast();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestCode = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/customer-auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      toast.show(data.message, 'info');
      setDevCode(data.devCode || null);
      setStage('code');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/customer-auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      if (res.ok) {
        toast.show('Signed in', 'success');
        setStage('email');
        setEmail('');
        setCode('');
        onSignedIn();
      } else {
        const data = await res.json();
        toast.show(data.message || 'Invalid code', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={stage === 'email' ? 'Sign in' : 'Enter your code'}>
      {stage === 'email' ? (
        <>
          <p style={{ marginTop: 0, color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
            We'll send a one-time code to the email you used when booking — no password needed.
          </p>
          <Input label="Email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button fullWidth loading={submitting} disabled={!email} onClick={requestCode}>
            Send code
          </Button>
          <p style={{ marginTop: 'var(--space-4)', marginBottom: 0, color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>
            Haven't booked with us yet? Book an appointment first — we'll set up your account automatically, no separate sign-up needed.
          </p>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0, color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
            Enter the 6-digit code we sent to {email}.
          </p>
          {devCode && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--brass-strong)' }}>
              Email isn't set up yet — here's your code directly: {devCode}
            </p>
          )}
          <Input label="Code" required autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button fullWidth loading={submitting} disabled={code.length !== 6} onClick={verifyCode}>
            Verify
          </Button>
          <button
            type="button"
            onClick={() => {
              setStage('email');
              setCode('');
            }}
            style={{
              display: 'block',
              margin: 'var(--space-3) auto 0',
              background: 'none',
              border: 'none',
              color: 'var(--ink-faint)',
              fontSize: 'var(--text-xs)',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Use a different email
          </button>
        </>
      )}
    </Modal>
  );
}
