// src/app/admin/(protected)/AdminLogoutButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { dynamicCacheNameForPathname } from '@/lib/pwaScope';
import styles from './AdminLogoutButton.module.css';

export function AdminLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if ('caches' in window) {
      caches.delete(dynamicCacheNameForPathname(window.location.pathname)).catch(() => {});
    }
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout} className={styles.logout}>
      Logout
    </Button>
  );
}
