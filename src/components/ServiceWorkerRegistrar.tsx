// src/components/ServiceWorkerRegistrar.tsx
//
// Replaces the old unconditional `register('/sw.js')` (global '/' scope,
// same worker and cache for every tenant) with a per-route registration —
// see src/lib/pwaScope.ts for why each tenant needs its own scope. Mounted
// once in the root layout; re-registering on every pathname change is what
// gives a client-side navigation into a different tenant its own scoped
// worker without a full page reload.
'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { scopeForPathname } from '@/lib/pwaScope';

export function ServiceWorkerRegistrar() {
  const pathname = usePathname();

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !pathname) return;
    const scope = scopeForPathname(pathname);
    navigator.serviceWorker.register('/sw.js', { scope }).catch((err) => console.error('SW registration failed:', err));
  }, [pathname]);

  return null;
}
