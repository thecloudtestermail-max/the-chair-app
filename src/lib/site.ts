// src/lib/site.ts
//
// Single source of truth for the platform's public address. Used by the
// global footer, the sitemap and robots files, and root metadata so the
// discovery URL is never hard-coded in more than one place. Override with
// NEXT_PUBLIC_SITE_URL if the app ever moves to a custom domain.
export const SITE_NAME = 'The Chair App';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://the-chair-app.vercel.app').replace(/\/+$/, '');

export const SITE_HOST = new URL(SITE_URL).host;

/**
 * The address the footer links to. When shown inside a salon's own pages, it
 * carries UTM tags naming that salon, so the platform can see which salons
 * send visitors to discovery (the raw material for the referral loop in the
 * adoption plan). On the platform's own pages it is the clean URL.
 */
export function discoveryUrl(tenantSlug?: string): string {
  if (!tenantSlug) return SITE_URL;
  const params = new URLSearchParams({
    utm_source: 'tenant_footer',
    utm_medium: 'referral',
    utm_campaign: tenantSlug,
  });
  return `${SITE_URL}/?${params.toString()}`;
}
