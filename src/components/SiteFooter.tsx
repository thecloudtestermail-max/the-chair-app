// src/components/SiteFooter.tsx
//
// One footer for every page in the app (mounted once, in the root layout),
// linking to the platform's public discovery address so visitors on any salon
// page, and anyone who sees a screenshot or a shared link, can find their
// way to The Chair App.
//
// It replaces the per-tenant "Powered by" link. Exactly one <footer> exists
// on a page, so assistive tech announces a single contentinfo landmark.
//
// Inside a salon's pages (/t/[slug]/...) the link opens in a new tab so a
// customer mid-booking never loses their place, and carries UTM tags naming
// the salon (see lib/site.ts). Everywhere else it is a plain same-tab link.
'use client';
import { usePathname } from 'next/navigation';
import { SITE_HOST, SITE_NAME, discoveryUrl } from '@/lib/site';
import styles from './SiteFooter.module.css';

const TENANT_PATH = /^\/t\/([^/]+)/;

export function SiteFooter() {
  const pathname = usePathname() || '/';
  const tenantSlug = pathname.match(TENANT_PATH)?.[1];
  const inSalon = Boolean(tenantSlug);

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.tagline}>
          Discover and book top salons and barbershops on <strong>{SITE_NAME}</strong>.
        </p>
        <a
          href={discoveryUrl(tenantSlug)}
          className={styles.link}
          {...(inSalon ? { target: '_blank', rel: 'noopener' } : {})}
        >
          {SITE_HOST}
          <span aria-hidden="true">{' \u2197'}</span>
          {inSalon && <span className="visually-hidden"> (opens in a new tab)</span>}
        </a>
      </div>
    </footer>
  );
}
