// src/lib/pwaScope.ts
//
// PWA scope/cache-name derivation, shared between the client (service
// worker registration, logout cache-clears) and public/sw.js (which can't
// import this — its copy of the same logic must stay in sync by hand).
//
// Every tenant needs its own installable PWA — its own manifest (already
// existed, see t/[tenantSlug]/manifest.ts), but also its own service-worker
// scope and cache namespace. Previously the whole app shared one SW
// registration at scope '/' and one hardcoded cache name
// ('chair-app-v1-dynamic'): installing two different salons' "apps" was
// really the same worker and cache underneath, so a staff logout at any
// one salon wiped every other salon's offline cache too, and an offline
// fallback on salon B's installed app could serve salon A's last-cached
// page. Scoping registration to `/t/{slug}/` per tenant (and 'root' for
// the discovery page) fixes both.
//
// The platform admin console at /admin gets the same treatment as its own
// third scope: it is a genuinely separate installed app (own icon, own
// offline cache) from the discovery homepage it happens to share an origin
// with, so it can't be lumped into 'root' either.
const TENANT_PATH_RE = /^\/t\/([^/]+)/;
const ADMIN_PATH_RE = /^\/admin(?:\/|$)/;

/** Service-worker registration scope for the given pathname. Trailing slash matters — it's what stops `/t/acme` from also matching `/t/acme-annex/...`. */
export function scopeForPathname(pathname: string): string {
  const tenantMatch = pathname.match(TENANT_PATH_RE);
  if (tenantMatch) return `/t/${tenantMatch[1]}/`;
  if (ADMIN_PATH_RE.test(pathname)) return '/admin/';
  return '/';
}

function scopeIdForPathname(pathname: string): string {
  const tenantMatch = pathname.match(TENANT_PATH_RE);
  if (tenantMatch) return `t-${tenantMatch[1]}`;
  if (ADMIN_PATH_RE.test(pathname)) return 'admin';
  return 'root';
}

/** The dynamic-cache name this pathname's scope owns — pass to `caches.delete()` on logout so it only clears that tenant's (or the admin's) cache. */
export function dynamicCacheNameForPathname(pathname: string): string {
  return `chair-app-v1-${scopeIdForPathname(pathname)}-dynamic`;
}
