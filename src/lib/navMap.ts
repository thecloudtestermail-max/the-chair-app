/**
 * navMap.ts
 *
 * Single source of truth for all application routes, their nesting,
 * ownership (discovery/salon/console), and parent references. Used by
 * smart Back links and navigation guards to understand context.
 */

export type AppWorld = 'root' | 'salon' | 'console' | 'admin';

export interface RouteNode {
  path: string;
  world: AppWorld;
  label: string;
  parent?: string; // path of parent route, used for Back links
  protected?: 'staff' | 'admin' | 'customer';
  hidden?: boolean; // not shown in primary nav
}

/**
 * Every route in the app, keyed by path pattern.
 * Use {slug} for dynamic segments, e.g. /t/{tenantSlug}/book
 */
export const ROUTES: Record<string, RouteNode> = {
  // ============ ROOT / DISCOVERY ============
  '/': {
    path: '/',
    world: 'root',
    label: 'Home',
  },
  '/account': {
    path: '/account',
    world: 'root',
    label: 'My account',
    parent: '/',
    protected: 'customer',
  },
  '/login': {
    path: '/login',
    world: 'root',
    label: 'Sign in',
    parent: '/',
  },
  '/reset-password': {
    path: '/reset-password',
    world: 'root',
    label: 'Reset password',
    parent: '/login',
  },

  // ============ ADMIN PLATFORM ============
  '/admin': {
    path: '/admin',
    world: 'admin',
    label: 'Platform admin',
  },
  '/admin/login': {
    path: '/admin/login',
    world: 'admin',
    label: 'Admin sign in',
    parent: '/admin',
  },
  '/admin/dashboard': {
    path: '/admin/(protected)',
    world: 'admin',
    label: 'Dashboard',
    parent: '/admin',
    protected: 'admin',
  },
  '/admin/tenants': {
    path: '/admin/(protected)/tenants',
    world: 'admin',
    label: 'Tenants',
    parent: '/admin/dashboard',
    protected: 'admin',
  },
  '/admin/staff': {
    path: '/admin/(protected)/staff',
    world: 'admin',
    label: 'Staff',
    parent: '/admin/dashboard',
    protected: 'admin',
  },
  '/admin/admins': {
    path: '/admin/(protected)/admins',
    world: 'admin',
    label: 'Admins',
    parent: '/admin/dashboard',
    protected: 'admin',
  },
  '/admin/analytics': {
    path: '/admin/(protected)/analytics',
    world: 'admin',
    label: 'Analytics',
    parent: '/admin/dashboard',
    protected: 'admin',
  },
  '/admin/audit-log': {
    path: '/admin/(protected)/audit-log',
    world: 'admin',
    label: 'Audit log',
    parent: '/admin/dashboard',
    protected: 'admin',
  },
  '/admin/moderation': {
    path: '/admin/(protected)/moderation',
    world: 'admin',
    label: 'Moderation',
    parent: '/admin/dashboard',
    protected: 'admin',
  },
  '/admin/security': {
    path: '/admin/(protected)/security',
    world: 'admin',
    label: 'Security',
    parent: '/admin/dashboard',
    protected: 'admin',
  },

  // ============ SALON / CUSTOMER FACING ============
  '/t/{tenantSlug}': {
    path: '/t/{tenantSlug}',
    world: 'salon',
    label: 'Salon home',
  },
  '/t/{tenantSlug}/login': {
    path: '/t/{tenantSlug}/login',
    world: 'salon',
    label: 'Sign in',
    parent: '/t/{tenantSlug}',
  },
  '/t/{tenantSlug}/book': {
    path: '/t/{tenantSlug}/book',
    world: 'salon',
    label: 'Book appointment',
    parent: '/t/{tenantSlug}',
  },
  '/t/{tenantSlug}/appointments': {
    path: '/t/{tenantSlug}/appointments',
    world: 'salon',
    label: 'My appointments',
    parent: '/t/{tenantSlug}',
    protected: 'customer',
  },
  '/t/{tenantSlug}/account': {
    path: '/t/{tenantSlug}/account',
    world: 'salon',
    label: 'Account',
    parent: '/t/{tenantSlug}',
    protected: 'customer',
  },
  '/t/{tenantSlug}/barbers/{barberSlug}': {
    path: '/t/{tenantSlug}/barbers/{barberSlug}',
    world: 'salon',
    label: 'Barber profile',
    parent: '/t/{tenantSlug}',
  },

  // ============ STAFF CONSOLE ============
  '/t/{tenantSlug}/dashboard': {
    path: '/t/{tenantSlug}/dashboard',
    world: 'console',
    label: 'Dashboard',
    parent: '/t/{tenantSlug}',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/appointments': {
    path: '/t/{tenantSlug}/dashboard/appointments',
    world: 'console',
    label: 'Appointments',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/barbers': {
    path: '/t/{tenantSlug}/dashboard/barbers',
    world: 'console',
    label: 'Barbers',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/services': {
    path: '/t/{tenantSlug}/dashboard/services',
    world: 'console',
    label: 'Services',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/staff': {
    path: '/t/{tenantSlug}/dashboard/staff',
    world: 'console',
    label: 'Team',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/customers': {
    path: '/t/{tenantSlug}/dashboard/customers',
    world: 'console',
    label: 'Customers',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/posts': {
    path: '/t/{tenantSlug}/dashboard/posts',
    world: 'console',
    label: 'Posts',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/reviews': {
    path: '/t/{tenantSlug}/dashboard/reviews',
    world: 'console',
    label: 'Reviews',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/waitlist': {
    path: '/t/{tenantSlug}/dashboard/waitlist',
    world: 'console',
    label: 'Waitlist',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/analytics': {
    path: '/t/{tenantSlug}/dashboard/analytics',
    world: 'console',
    label: 'Analytics',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/settings': {
    path: '/t/{tenantSlug}/dashboard/settings',
    world: 'console',
    label: 'Settings',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
  '/t/{tenantSlug}/dashboard/account': {
    path: '/t/{tenantSlug}/dashboard/account',
    world: 'console',
    label: 'My account',
    parent: '/t/{tenantSlug}/dashboard',
    protected: 'staff',
  },
};

/**
 * Find a route by exact match or pattern match (handles {slug} notation).
 * Returns the route node or undefined if not found.
 */
export function findRoute(pathname: string): RouteNode | undefined {
  // Try exact match first
  const exact = ROUTES[pathname];
  if (exact) return exact;

  // Try pattern matching with {slug} notation
  for (const [pattern, route] of Object.entries(ROUTES)) {
    if (matchesPattern(pathname, pattern)) {
      return route;
    }
  }

  return undefined;
}

/**
 * Match a pathname against a route pattern (e.g. /t/{tenantSlug}/book).
 * Returns true if pathname matches the pattern.
 */
function matchesPattern(pathname: string, pattern: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    const pattern = patternParts[i];
    const path = pathParts[i];

    // {slug} matches any single segment
    if (pattern.startsWith('{') && pattern.endsWith('}')) {
      continue;
    }

    if (pattern !== path) return false;
  }

  return true;
}

/**
 * Extract slug values from a pathname given a pattern.
 * e.g. extractSlugs('/t/barbershop-1/book', '/t/{tenantSlug}/book')
 *      => { tenantSlug: 'barbershop-1' }
 */
export function extractSlugs(pathname: string, pattern: string): Record<string, string> {
  const slugs: Record<string, string> = {};
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith('{') && p.endsWith('}')) {
      const slugName = p.slice(1, -1);
      slugs[slugName] = pathParts[i];
    }
  }

  return slugs;
}

/**
 * Get the parent route for a given pathname, staying within the same world.
 * Returns the parent's pathname or undefined if at root of its world.
 */
export function getParentPath(pathname: string): string | undefined {
  const route = findRoute(pathname);
  if (!route?.parent) return undefined;

  // If parent has dynamic segments, we need to preserve the slugs
  // from the current pathname
  if (route.parent.includes('{')) {
    const slugs = extractParentSlugs(pathname, route.path);
    return expandTemplate(route.parent, slugs);
  }

  return route.parent;
}

/**
 * Extract only the slugs needed for the parent route from a child pathname.
 * e.g. child: /t/barbershop/dashboard/services
 *      childPattern: /t/{tenantSlug}/dashboard/services
 *      parentPattern: /t/{tenantSlug}/dashboard
 *      => { tenantSlug: 'barbershop' }
 */
function extractParentSlugs(pathname: string, childPattern: string): Record<string, string> {
  const slugs = extractSlugs(pathname, childPattern);
  return slugs;
}

/**
 * Replace {slug} markers in a pattern with actual values.
 * e.g. expandTemplate('/t/{tenantSlug}/book', { tenantSlug: 'barbershop' })
 *      => '/t/barbershop/book'
 */
function expandTemplate(template: string, slugs: Record<string, string>): string {
  return template.replace(/{(\w+)}/g, (_, key) => slugs[key] || '');
}

/**
 * Get all routes in a given world.
 */
export function getWorldRoutes(world: AppWorld): RouteNode[] {
  return Object.values(ROUTES).filter((r) => r.world === world);
}

/**
 * Check if a route requires authentication.
 */
export function isProtected(route: RouteNode | undefined): boolean {
  return !!route?.protected;
}
