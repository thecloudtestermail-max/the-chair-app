// src/components/auth/AuthPage.tsx
//
// The full-page frame for sign-in, used at /login (The Chair App) and
// /t/[slug]/login (a salon's own app). Same form either way; the only
// difference is the salon context, which the server uses to decide where to
// send staff and where a customer should land.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket } from '@/components/ui/Ticket';
import { safeNextPath } from '@/lib/identity';
import { SignInForm, destinationAfterSignIn, type AuthMode, type SignedInResult } from './SignInForm';
import styles from './AuthPage.module.css';

const HEADINGS: Record<AuthMode, string> = { signin: 'Sign in', register: 'Create your account', forgot: 'Reset your password' };

export function AuthPage({ tenantSlug, eyebrow }: { tenantSlug?: string; eyebrow: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signin');

  const handleSignedIn = (result: SignedInResult) => {
    // ?next= lets a page that needed sign-in bring the person back to it.
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));
    router.push(destinationAfterSignIn(result, next));
    router.refresh();
  };

  return (
    <div className={styles.wrap}>
      <Ticket className={styles.ticket}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.heading}>{HEADINGS[mode]}</h1>
        <SignInForm tenantSlug={tenantSlug} onModeChange={setMode} onSignedIn={handleSignedIn} />
      </Ticket>
    </div>
  );
}
