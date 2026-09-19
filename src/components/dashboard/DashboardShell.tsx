// src/components/dashboard/DashboardShell.tsx
'use client';
import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { RoleProvider } from '@/hooks/useRole';
import styles from './DashboardShell.module.css';

interface NavItem {
  href: string;
  label: string;
  roles: Array<'admin' | 'receptionist' | 'barber'>;
}

const NAV_ITEMS: NavItem[] = [
  { href: '', label: 'Overview', roles: ['admin', 'receptionist', 'barber'] },
  { href: '/appointments', label: 'Appointments', roles: ['admin', 'receptionist', 'barber'] },
  { href: '/posts', label: 'Posts', roles: ['admin', 'barber'] },
  { href: '/waitlist', label: 'Waitlist', roles: ['admin', 'receptionist'] },
  { href: '/services', label: 'Services', roles: ['admin'] },
  { href: '/barbers', label: 'Barbers', roles: ['admin'] },
  { href: '/customers', label: 'Customers', roles: ['admin', 'receptionist'] },
  { href: '/reviews', label: 'Reviews', roles: ['admin'] },
  { href: '/analytics', label: 'Analytics', roles: ['admin'] },
  { href: '/settings', label: 'Settings', roles: ['admin'] },
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
  const [navOpen, setNavOpen] = useState(false);
  const base = `/t/${tenantSlug}/dashboard`;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if ('caches' in window) {
      caches.delete('chair-app-v1-dynamic').catch(() => {});
    }
    router.push(`/t/${tenantSlug}/login`);
    router.refresh();
  };

  return (
    <div className={styles.shell}>
      <button className={styles.navToggle} onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen} aria-controls="dashboard-nav">
        <span className={styles.navToggleBar} />
        <span className={styles.navToggleBar} />
        <span className={styles.navToggleBar} />
        <span className="visually-hidden">Toggle navigation</span>
      </button>

      <nav id="dashboard-nav" className={[styles.sidebar, navOpen ? styles.sidebarOpen : ''].join(' ')} aria-label="Dashboard navigation">
        <div className={styles.brand}>
          <span className={styles.brandTicket} aria-hidden="true">
            #
          </span>
          <div>
            <p className={styles.brandName}>{tenantName}</p>
            <p className={styles.brandRole}>{role}</p>
          </div>
        </div>
        <ul className={styles.navList}>
          {items.map((item) => {
            const href = `${base}${item.href}`;
            const active = pathname === href || (item.href === '' && pathname === base);
            return (
              <li key={item.href}>
                <Link href={href} className={[styles.navLink, active ? styles.navLinkActive : ''].join(' ')} aria-current={active ? 'page' : undefined}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className={styles.sidebarFooter}>
          <Link href={`/t/${tenantSlug}`} className={styles.navLink}>
            View public page
          </Link>
          <button className={styles.logout} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        <RoleProvider value={role}>{children}</RoleProvider>
      </main>
    </div>
  );
}
