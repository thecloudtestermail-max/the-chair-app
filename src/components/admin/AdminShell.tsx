// src/components/admin/AdminShell.tsx
//
// Platform-admin equivalent of dashboard/DashboardShell.tsx — same
// persistent icon-only rail (always part of the layout, narrower and
// unlabeled below the desktop breakpoint, no off-canvas/overlay/scroll-lock
// machinery to maintain). One role here (super_admin), so unlike
// DashboardShell there's no per-role item filtering.
'use client';
import { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { dynamicCacheNameForPathname } from '@/lib/pwaScope';
import { OverviewIcon, AnalyticsIcon, LogoutIcon, PublicPageIcon } from '@/components/dashboard/NavIcons';
import { TenantsIcon, StaffDirectoryIcon, ModerationIcon, AdminsIcon, AuditLogIcon, SecurityIcon } from './AdminIcons';
import styles from './AdminShell.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactElement;
}

const NAV_ITEMS: NavItem[] = [
  { href: '', label: 'Overview', icon: OverviewIcon },
  { href: '/tenants', label: 'Tenants', icon: TenantsIcon },
  { href: '/staff', label: 'Staff', icon: StaffDirectoryIcon },
  { href: '/moderation', label: 'Moderation', icon: ModerationIcon },
  { href: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
  { href: '/admins', label: 'Admins', icon: AdminsIcon },
  { href: '/audit-log', label: 'Audit log', icon: AuditLogIcon },
  { href: '/security', label: 'Security', icon: SecurityIcon },
];

export function AdminShell({ adminName, children }: { adminName: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = '/admin';

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if ('caches' in window) {
      caches.delete(dynamicCacheNameForPathname(window.location.pathname)).catch(() => {});
    }
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Admin navigation">
        <div className={styles.brand}>
          <span className={styles.brandTicket} aria-hidden="true">
            #
          </span>
          <div className={styles.brandText}>
            <p className={styles.brandName}>The Chair App</p>
            <p className={styles.brandRole}>{adminName}</p>
          </div>
        </div>
        <ul className={styles.navList}>
          {NAV_ITEMS.map((item) => {
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
          <Link href="/" className={styles.navLink} title="View public site">
            <PublicPageIcon className={styles.navIcon} />
            <span className={styles.navLabel}>View public site</span>
          </Link>
          <button className={[styles.navLink, styles.logout].join(' ')} onClick={handleLogout} title="Log out">
            <LogoutIcon className={styles.navIcon} />
            <span className={styles.navLabel}>Log out</span>
          </button>
        </div>
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
