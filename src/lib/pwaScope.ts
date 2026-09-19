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
// everything else — the discovery page and platform admin) fixes both.
const TENANT_PATH_RE = /^\/t\/([^/]+)/;

/** Service-worker registration scope for the given pathname. Trailing slash matters — it's what stops `/t/acme` from also matching `/t/acme-annex/...`. */
export function scopeForPathname(pathname: string): string {
  const match = pathname.match(TENANT_PATH_RE);
  return match ? `/t/${match[1]}/` : '/';
}

function scopeIdForPathname(pathname: string): string {
  const match = pathname.match(TENANT_PATH_RE);
  return match ? `t-${match[1]}` : 'root';
}

/** The dynamic-cache name this pathname's scope owns — pass to `caches.delete()` on logout so it only clears that tenant's cache. */
export function dynamicCacheNameForPathname(pathname: string): string {
  return `chair-app-v1-${scopeIdForPathname(pathname)}-dynamic`;
}
