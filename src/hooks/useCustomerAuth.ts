// src/hooks/useCustomerAuth.ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CustomerInfo {
  customerId: string;
  name: string;
  email: string;
  phone?: string;
}

export function useCustomerAuth() {
  const [customer, setCustomer] = useState<CustomerInfo | null | undefined>(undefined); // undefined = still checking
  const [signInOpen, setSignInOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/customer-auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setCustomer)
      .catch(() => setCustomer(null));
  }, []);

  useEffect(refresh, [refresh]);

  const requireSignIn = useCallback(
    (action: () => void) => {
      if (customer) {
        action();
      } else {
        pendingAction.current = action;
        setSignInOpen(true);
      }
    },
    [customer]
  );

  const onSignedIn = useCallback(() => {
    setSignInOpen(false);
    refresh();
    pendingAction.current?.();
    pendingAction.current = null;
  }, [refresh]);

  const signOut = useCallback(async () => {
    // One sign-out for everyone: ends the customer and any staff session.
    await fetch('/api/auth/logout', { method: 'POST' });
    setCustomer(null);
  }, []);

  return { customer, signInOpen, setSignInOpen, requireSignIn, onSignedIn, signOut, refresh };
}
