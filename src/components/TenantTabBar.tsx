/**
 * TenantTabBar.tsx
 *
 * Persistent bottom tab bar on salon pages, allowing quick switch
 * between customer-facing (Book, Appointments) and staff-facing (Dashboard)
 * contexts. Only renders the tabs a given user can access.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './TenantTabBar.module.css';

interface TenantTabBarProps {
  tenantSlug: string;
  isCustomer?: boolean; // user has a customer session
  isStaff?: boolean; // user has a staff session
  showDashboard?: boolean; // show dashboard tab even if not logged in (for redirect hint)
}

export function TenantTabBar({
  tenantSlug,
  isCustomer = false,
  isStaff = false,
  showDashboard = false,
}: TenantTabBarProps) {
  const pathname = usePathname();
  const base = `/t/${tenantSlug}`;

  // Which tab is currently active?
  const activeTab = pathname.startsWith(`${base}/dashboard`)
    ? 'dashboard'
    : pathname === `${base}/book`
      ? 'book'
      : pathname === `${base}/appointments`
        ? 'appointments'
        : 'home';

  return (
    <nav className={styles.tabBar} aria-label="Salon sections">
      <Link
        href={`${base}`}
        className={[styles.tab, activeTab === 'home' ? styles.tabActive : ''].join(' ')}
        aria-current={activeTab === 'home' ? 'page' : undefined}
      >
        <span className={styles.icon} aria-hidden="true">🏠</span>
        <span className={styles.label}>Home</span>
      </Link>

      <Link
        href={`${base}/book`}
        className={[styles.tab, activeTab === 'book' ? styles.tabActive : ''].join(' ')}
        aria-current={activeTab === 'book' ? 'page' : undefined}
      >
        <span className={styles.icon} aria-hidden="true">📅</span>
        <span className={styles.label}>Book</span>
      </Link>

      {isCustomer && (
        <Link
          href={`${base}/appointments`}
          className={[styles.tab, activeTab === 'appointments' ? styles.tabActive : ''].join(' ')}
          aria-current={activeTab === 'appointments' ? 'page' : undefined}
        >
          <span className={styles.icon} aria-hidden="true">✓</span>
          <span className={styles.label}>My bookings</span>
        </Link>
      )}

      {(isStaff || showDashboard) && (
        <Link
          href={`${base}/dashboard`}
          className={[styles.tab, activeTab === 'dashboard' ? styles.tabActive : ''].join(' ')}
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
          title={isStaff ? 'Staff dashboard' : 'Staff only'}
        >
          <span className={styles.icon} aria-hidden="true">⚙️</span>
          <span className={styles.label}>Manage</span>
        </Link>
      )}
    </nav>
  );
}
