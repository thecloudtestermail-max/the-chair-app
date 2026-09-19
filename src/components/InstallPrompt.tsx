// src/components/InstallPrompt.tsx
'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { scopeForPathname } from '@/lib/pwaScope';
import styles from './InstallPrompt.module.css';

// Nav-audit follow-up: this banner used one sessionStorage key regardless
// of which tenant you were browsing, so dismissing it on one salon's page
// silently suppressed it on every other salon's page for the rest of the
// session — each install is a distinct app (see pwaScope.ts), so the
// dismissal needs to be too. Copy is also tenant-aware now instead of the
// generic "this app" on every surface.
export function InstallPrompt() {
  const pathname = usePathname();
  const [deferredEvent, setDeferredEvent] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [appName, setAppName] = useState<string | undefined>(undefined);

  const dismissKey = `installPromptDismissed:${scopeForPathname(pathname || '/')}`;
  const tenantSlug = pathname?.match(/^\/t\/([^/]+)/)?.[1];

  useEffect(() => {
    setDismissed(sessionStorage.getItem(dismissKey) === '1');
  }, [dismissKey]);

  useEffect(() => {
    if (!tenantSlug) {
      setAppName(undefined);
      return;
    }
    fetch(`/api/public/tenants/${tenantSlug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAppName(data?.tenant?.name))
      .catch(() => setAppName(undefined));
  }, [tenantSlug]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredEvent || dismissed) return null;

  const install = async () => {
    deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  };

  const dismiss = () => {
    sessionStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  return (
    <div className={styles.banner} role="complementary" aria-label="Install app">
      <span className={styles.text}>
        {appName ? `Install ${appName} for quicker access and offline booking.` : 'Install this app for quicker access and offline booking.'}
      </span>
      <div className={styles.actions}>
        <button className={styles.install} onClick={install}>
          Install
        </button>
        <button className={styles.dismiss} onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
