// src/components/auth/SignInForm.tsx
//
// THE sign-in experience, shared by the pop-up on public pages and the two
// full pages (/login and /t/[slug]/login). One form for everyone: customers,
// receptionists, barbers and salon owners all use email + password. What
// happens next depends on who the server says you are (see api/auth/login):
// staff go to their dashboard, customers stay where they were.
//
// Three modes in one place so nobody is sent somewhere else to sign up or to
// get back in:
//   signin    email + password
//   register  customers only: name, email, phone, password
//   forgot    emailed link when the platform has email set up, otherwise a
//             plain instruction to email support
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import styles from './SignInForm.module.css';

export type AuthMode = 'signin' | 'register' | 'forgot';

export interface SignedInResult {
  redirect: string;
  staff: { role: string; tenantSlug: string; mustChangePassword: boolean } | null;
  customer: { name: string } | null;
}

interface Choice { tenantSlug: string; tenantName: string; role: string }
interface Notice { tone: 'ok' | 'manual'; message: string; supportEmail?: string }

/** The salon this page belongs to, read from the address bar (works outside React tree context, e.g. in a shared modal). */
export function slugFromLocation(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.pathname.match(/^\/t\/([^/]+)/)?.[1];
}

/**
 * Where to send someone once signed in. Staff always land on their dashboard
 * (unless they were already heading somewhere inside it); customers go back
 * to where they were, or to the server's suggestion.
 */
export function destinationAfterSignIn(result: SignedInResult, next?: string | null): string {
  if (result.staff && result.redirect.endsWith('/dashboard')) {
    return next && next.startsWith(result.redirect) ? next : result.redirect;
  }
  return next || result.redirect;
}

const ROLE_LABEL: Record<string, string> = { admin: 'Owner', receptionist: 'Receptionist', barber: 'Barber' };

interface Props {
  tenantSlug?: string;
  initialMode?: AuthMode;
  initialEmail?: string;
  next?: string | null;
  onSignedIn: (result: SignedInResult) => void;
  onModeChange?: (mode: AuthMode) => void;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data: any = {};
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, data };
}

export function SignInForm({ tenantSlug, initialMode = 'signin', initialEmail = '', next, onSignedIn, onModeChange }: Props) {
  const [mode, setModeState] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [existsHint, setExistsHint] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const slug = () => tenantSlug ?? slugFromLocation();

  const setMode = (m: AuthMode) => {
    setModeState(m);
    setError(''); setNotice(null); setChoices(null); setExistsHint(false); setPassword('');
    onModeChange?.(m);
  };

  const finish = (data: any) => onSignedIn({ redirect: data.redirect ?? '/', staff: data.staff ?? null, customer: data.customer ?? null });

  const signIn = async (forSlug?: string) => {
    setSubmitting(true); setError('');
    try {
      const { ok, data } = await post('/api/auth/login', { email, password, tenantSlug: forSlug ?? slug() });
      if (!ok) { setError(data.message || 'Sign-in failed'); return; }
      if (data.needsChoice) { setChoices(data.options); return; }
      finish(data);
    } catch {
      setError('Sign-in failed. Check your connection and try again.');
    } finally { setSubmitting(false); }
  };

  const register = async () => {
    setSubmitting(true); setError(''); setExistsHint(false);
    try {
      const { ok, data } = await post('/api/auth/register', { name, email, phone, password, tenantSlug: slug() });
      if (!ok) { setError(data.message || 'Could not create your account'); setExistsHint(data.code === 'exists'); return; }
      finish(data);
    } catch {
      setError('Could not create your account. Check your connection and try again.');
    } finally { setSubmitting(false); }
  };

  const forgot = async () => {
    setSubmitting(true); setError(''); setNotice(null);
    try {
      const { ok, data } = await post('/api/auth/forgot', { email, tenantSlug: slug() });
      if (!ok) { setError(data.message || 'Something went wrong'); return; }
      setNotice({ tone: data.delivery === 'manual' ? 'manual' : 'ok', message: data.message, supportEmail: data.supportEmail });
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally { setSubmitting(false); }
  };

  const submit = (fn: () => void) => (e: React.FormEvent) => { e.preventDefault(); fn(); };

  const errorBox = error && (
    <p className={styles.error} role="alert">
      {error}
      {existsHint && (
        <>
          {' '}
          <button type="button" className={styles.inlineLink} onClick={() => setMode('forgot')}>Set or reset my password</button>
        </>
      )}
    </p>
  );

  if (choices) {
    return (
      <div className={styles.wrap}>
        <p className={styles.lead}>You have access at more than one salon. Where would you like to go?</p>
        <div className={styles.choices}>
          {choices.map((c) => (
            <Button key={c.tenantSlug} variant="secondary" fullWidth loading={submitting} onClick={() => signIn(c.tenantSlug)}>
              {c.tenantName} ({ROLE_LABEL[c.role] || c.role})
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'forgot') {
    return (
      <div className={styles.wrap}>
        <p className={styles.lead}>Enter your email and we'll help you get back in.</p>
        {errorBox}
        {notice ? (
          <div className={notice.tone === 'manual' ? styles.noticeManual : styles.noticeOk} role="status">
            <p>{notice.message}</p>
            {notice.tone === 'manual' && notice.supportEmail && (
              <p><a href={`mailto:${notice.supportEmail}?subject=${encodeURIComponent('Password reset for The Chair App')}`}>Email {notice.supportEmail}</a></p>
            )}
          </div>
        ) : (
          <form onSubmit={submit(forgot)} className={styles.form}>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
            <Button type="submit" loading={submitting} fullWidth>Send reset link</Button>
          </form>
        )}
        <button type="button" className={styles.link} onClick={() => setMode('signin')}>Back to sign in</button>
      </div>
    );
  }

  if (mode === 'register') {
    return (
      <div className={styles.wrap}>
        <p className={styles.lead}>Create an account to see your bookings and loyalty points, save favourite salons, and follow stylists.</p>
        {errorBox}
        <form onSubmit={submit(register)} className={styles.form}>
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" autoFocus />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" hint="So your salon can reach you about a booking." />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" hint="At least 8 characters." />
          <Button type="submit" loading={submitting} fullWidth>Create account</Button>
        </form>
        <button type="button" className={styles.link} onClick={() => setMode('signin')}>Already have an account? Sign in</button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {errorBox}
      <form onSubmit={submit(() => signIn())} className={styles.form}>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        <Button type="submit" loading={submitting} fullWidth>Sign in</Button>
      </form>
      <div className={styles.links}>
        <button type="button" className={styles.link} onClick={() => setMode('forgot')}>Forgot password?</button>
        <button type="button" className={styles.link} onClick={() => setMode('register')}>New here? Create an account</button>
      </div>
      <p className={styles.staffNote}>Team members sign in here too, with the email and password from their welcome guide.</p>
    </div>
  );
}
