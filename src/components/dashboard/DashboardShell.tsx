// src/components/dashboard/DashboardShell.tsx
//
// Nav-audit follow-up: the sidebar used to be an off-canvas panel on mobile
// (hidden by default, slid in over an overlay via a hamburger toggle) —
// requested change is a persistent icon-only rail instead, staying on the
// side at every width rather than hiding behind a button. That removes the
// need for open/close state, an overlay, Escape handling, and a scroll
// lock entirely — the rail is always part of the layout, just narrower and
// unlabeled below the desktop breakpoint (see DashboardShell.module.css).
'use client';
import { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { RoleProvider } from '@/hooks/useRole';
import { dynamicCacheNameForPathname } from '@/lib/pwaScope';
import {
  OverviewIcon,
  AppointmentsIcon,
  PostsIcon,
  WaitlistIcon,
  ServicesIcon,
  BarbersIcon,
  StaffIcon,
  CustomersIcon,
  ReviewsIcon,
  AnalyticsIcon,
  SettingsIcon,
  AccountIcon,
  PublicPageIcon,
  LogoutIcon,
} from './NavIcons';
import styles from './DashboardShell.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactElement;
  roles: Array<'admin' | 'receptionist' | 'barber'>;
}

const NAV_ITEMS: NavItem[] = [
  { href: '', label: 'Overview', icon: OverviewIcon, roles: ['admin', 'receptionist', 'barber'] },
  { href: '/appointments', label: 'Appointments', icon: AppointmentsIcon, roles: ['admin', 'receptionist', 'barber'] },
  { href: '/posts', label: 'Posts', icon: PostsIcon, roles: ['admin', 'barber'] },
  { href: '/waitlist', label: 'Waitlist', icon: WaitlistIcon, roles: ['admin', 'receptionist'] },
  { href: '/services', label: 'Services', icon: ServicesIcon, roles: ['admin'] },
  { href: '/barbers', label: 'Barbers', icon: BarbersIcon, roles: ['admin'] },
  { href: '/staff', label: 'Staff', icon: StaffIcon, roles: ['admin'] },
  { href: '/customers', label: 'Customers', icon: CustomersIcon, roles: ['admin', 'receptionist'] },
  { href: '/reviews', label: 'Reviews', icon: ReviewsIcon, roles: ['admin'] },
  { href: '/analytics', label: 'Analytics', icon: AnalyticsIcon, roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['admin'] },
  { href: '/account', label: 'Account', icon: AccountIcon, roles: ['admin', 'receptionist', 'barber'] },
];

export function DashboardShell({
  tenantSlug,
  tenantName,
  role,
  children,
}: {
  tenantSlug: string;
  tenantName: string;
  role: 'admin' | 'receptionist' | 'barber';
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/t/${tenantSlug}/dashboard`;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if ('caches' in window) {
      caches.delete(dynamicCacheNameForPathname(window.location.pathname)).catch(() => {});
    }
    router.push(`/t/${tenantSlug}/login`);
    router.refresh();
  };

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Dashboard navigation">
        <div className={styles.brand}>
          <span className={styles.brandTicket} aria-hidden="true">
            #
          </span>
          <div className={styles.brandText}>
            <p className={styles.brandName}>{tenantName}</p>
            <p className={styles.brandRole}>{role}</p>
          </div>
        </div>
        <ul className={styles.navList}>
          {items.map((item) => {
            const href = `${base}${item.href}`;
            const active = pathname === href || (item.href === '' && pathname === base);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={href}
                  className={[styles.navLink, active ? styles.navLinkActive : ''].join(' ')}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  <Icon className={styles.navIcon} />
                  <span className={styles.navLabel}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className={styles.sidebarFooter}>
          <Link href={`/t/${tenantSlug}`} className={styles.navLink} title="View public page">
            <PublicPageIcon className={styles.navIcon} />
            <span className={styles.navLabel}>View public page</span>
          </Link>
          <button className={[styles.navLink, styles.logout].join(' ')} onClick={handleLogout} title="Log out">
            <LogoutIcon className={styles.navIcon} />
            <span className={styles.navLabel}>Log out</span>
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        <RoleProvider value={role}>{children}</RoleProvider>
      </main>
    </div>
  );
}
