// src/components/CustomerSignInModal.tsx
//
// The sign-in pop-up used across public pages (feed likes, follows,
// favourites, appointments...). It is now just a frame around the shared
// SignInForm: email + password, "Create account" and "Forgot password" all
// live inside it, exactly as on the full sign-in pages. The old email-code
// flow (and its "book first, we'll create your account" workaround) is gone.
'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { SignInForm, destinationAfterSignIn, type AuthMode, type SignedInResult } from '@/components/auth/SignInForm';

const TITLES: Record<AuthMode, string> = { signin: 'Sign in', register: 'Create your account', forgot: 'Reset your password' };

export function CustomerSignInModal({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<AuthMode>('signin');

  const handleSignedIn = (result: SignedInResult) => {
    // Team members who sign in from a public page go to their dashboard.
    if (result.staff && result.redirect.endsWith('/dashboard')) {
      window.location.assign(destinationAfterSignIn(result));
      return;
    }
    toast.show(result.customer ? `Welcome, ${result.customer.name.split(' ')[0]}` : 'Signed in', 'success');
    setMode('signin');
    onSignedIn();
  };

  return (
    <Modal open={open} onClose={onClose} title={TITLES[mode]}>
      <SignInForm onModeChange={setMode} onSignedIn={handleSignedIn} />
    </Modal>
  );
}
