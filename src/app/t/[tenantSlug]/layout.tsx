// src/app/t/[tenantSlug]/layout.tsx
//
// Public/customer-facing chrome for a tenant. Three audit fixes folded in
// while rebuilding this for the design system:
//   1. The nav used to show "Logout" and "My Appointments" unconditionally,
//      even to a signed-out visitor, and never linked to staff login at
//      all (both flagged in AUDIT_REPORT.md). Now it branches on whether a
//      staff session exists, and links to /login when it doesn't.
//   2. This layout wraps EVERY /t/[tenantSlug]/** route, including the new
//      /dashboard surface (Next's nested-layout rule) — the dashboard has
//      its own full chrome (DashboardShell), so this component renders
//      children bare (no header/footer) whenever the path is under
//      /dashboard, rather than double-chroming the staff console.
//   3. Signed-in state is shown for BOTH kinds of session (staff `session`
//      cookie, customer `customerClaim` cookie). Everyone signs in the same
//      way now, so the header has one "Sign in" button (the old separate
//      "Staff sign in" link is gone), an "Account" link for customers, and a
//      "Dashboard" link for team members, with a single Sign out that ends
//      whichever sessions exist. The link list collapses into a mobile menu
//      and marks the current section via aria-current.
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { tenantThemeStyle } from '@/lib/tenantTheme';
import { Skeleton } from '@/components/ui/Skeleton';
import { ToastProvider } from '@/components/ui/Toast';
import { CustomerSignInModal } from '@/components/CustomerSignInModal';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { dynamicCacheNameForPathname } from '@/lib/pwaScope';
import styles from './layout.module.css';

interface VerifyResult {
  role: string;
  subjectType: 'user' | 'customer';
  tenantSlug?: string;
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tenantSlug: string }>();
  const pathname = usePathname();
  const tenantSlug = params.tenantSlug;
  const isDashboard = pathname?.includes(`/t/${tenantSlug}/dashboard`);

  const [user, setUser] = useState<VerifyResult | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<{ name: string; branding?: any; logoUrl?: string } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const { customer, signInOpen, setSignInOpen, onSignedIn } = useCustomerAuth();

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [navOpen]);

  useEffect(() => {
    if (isDashboard) return; // dashboard has its own auth-gated layout
    const verifySession = async () => {
      try {
        const res = await fetch('/api/auth/verify');
        if (res.ok) setUser(await res.json());
      } catch {
        // not signed in — fine, this is a public surface
      } finally {
        setCheckedAuth(true);
      }
    };
    verifySession();
  }, [isDashboard]);

  useEffect(() => {
    if (!tenantSlug) return;
    fetch(`/api/public/tenants/${tenantSlug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tenant) {
          setTenantInfo({ name: data.tenant.name, branding: data.tenant.branding, logoUrl: data.settings?.logoUrl });
        }
      })
      .catch(() => {});
  }, [tenantSlug]);

  if (isDashboard) {
    return <>{children}</>;
  }

  // One sign-out ends the staff session and the customer session together.
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if ('caches' in window) {
      caches.delete(dynamicCacheNameForPathname(window.location.pathname)).catch(() => {});
    }
    setUser(null);
    window.location.href = `/t/${tenantSlug}`;
  };

  const isStaff = user?.subjectType === 'user';
  const bookHref = `/t/${tenantSlug}/book`;
  const appointmentsHref = `/t/${tenantSlug}/appointments`;
  const accountHref = `/t/${tenantSlug}/account`;
  const isActive = (href: string) => pathname === href;

  return (
    <ToastProvider>
      <div className={styles.shell} style={tenantThemeStyle(tenantInfo?.branding)}>
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <Link href={`/t/${tenantSlug}`} className={styles.brand}>
              {tenantInfo?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenantInfo.logoUrl} alt="" className={styles.logo} />
              ) : (
                <span className={styles.logoFallback} aria-hidden="true">
                  {(tenantInfo?.name || '?').charAt(0)}
                </span>
              )}
              <span>{tenantInfo?.name || <Skeleton width="8rem" />}</span>
            </Link>
            <button
              className={styles.navToggle}
              onClick={() => setNavOpen((v) => !v)}
              aria-expanded={navOpen}
              aria-controls="tenant-nav"
            >
              <span className={styles.navToggleBar} />
              <span className={styles.navToggleBar} />
              <span className={styles.navToggleBar} />
              <span className="visually-hidden">Toggle menu</span>
            </button>
          </div>
          <nav id="tenant-nav" className={[styles.nav, navOpen ? styles.navOpen : ''].join(' ')} aria-label="Main">
            <Link
              href={bookHref}
              className={styles.navLink}
              aria-current={isActive(bookHref) ? 'page' : undefined}
            >
              Book
            </Link>
            <Link
              href={appointmentsHref}
              className={styles.navLink}
              aria-current={isActive(appointmentsHref) ? 'page' : undefined}
            >
              My appointments
            </Link>

            <div className={styles.navDivider} aria-hidden="true" />

            {!checkedAuth || customer === undefined ? null : (
              <>
                {isStaff && (
                  <Link href={user?.role === 'super_admin' ? '/admin' : `/t/${user?.tenantSlug || tenantSlug}/dashboard`} className={styles.navLink}>
                    Dashboard
                  </Link>
                )}
                {customer && (
                  <>
                    <span className={styles.customerName}>Hi, {customer.name.split(' ')[0]}</span>
                    <Link
                      href={accountHref}
                      className={styles.navLink}
                      aria-current={isActive(accountHref) ? 'page' : undefined}
                    >
                      Account
                    </Link>
                  </>
                )}
                {isStaff || customer ? (
                  <button onClick={handleLogout} className={styles.navButton}>
                    {isStaff ? 'Log out' : 'Sign out'}
                  </button>
                ) : (
                  <button onClick={() => setSignInOpen(true)} className={styles.navButtonLink}>
                    Sign in
                  </button>
                )}
              </>
            )}
          </nav>
        </header>

        {navOpen && <div className={styles.overlay} onClick={() => setNavOpen(false)} aria-hidden="true" />}

        <main className={styles.main}>{children}</main>

        {/* Not a <footer>: the global SiteFooter (root layout) is the page's
            single contentinfo landmark and carries the discovery link. */}
        <p className={styles.copyright}>&copy; {new Date().getFullYear()} {tenantInfo?.name || 'The Chair App'}</p>
      </div>

      <CustomerSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} onSignedIn={onSignedIn} />
    </ToastProvider>
  );
}
