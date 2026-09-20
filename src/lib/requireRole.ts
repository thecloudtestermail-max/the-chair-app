// src/lib/requireRole.ts
import { verifySessionToken } from './auth';
import { readCookie, STAFF_COOKIE } from './authCookies';
import { Session } from './types';

/**
 * Verifies the session cookie and checks the caller's role.
 *
 * Tenant scoping is NOT done here and is NOT based on any client-supplied
 * header — callers must use `session.tenantId` (set at login, verified
 * server-side via the session token) as the only source of truth for which
 * tenant's data a request is allowed to touch. `super_admin` sessions have
 * no `tenantId` at all, which is expected — platform-admin routes should not
 * require one.
 */
export async function requireRole(
  request: Request,
  allowedRoles: string[]
): Promise<Session | null> {
  const session = await verifySessionToken(readCookie(request, STAFF_COOKIE));
  if (!session) return null;

  // A staff member still on their temporary password can do nothing except
  // choose a new one (api/auth/password reads the session directly, not via
  // this function).
  if (session.mustChangePassword) return null;

  if (!allowedRoles.includes(session.role)) return null;

  return session;
}
