// src/lib/authCookies.ts
//
// The two auth cookies and the only place they are set or cleared:
//   session        staff / super_admin (7 days), resolves via lib/auth.ts
//   customerClaim  customer           (30 days), resolves via lib/customerAuth.ts
// They stay separate on purpose (a customer token never unlocks a staff
// route); the sign-in screen and API are what is unified.
export const STAFF_COOKIE = 'session';
export const CUSTOMER_COOKIE = 'customerClaim';

const base = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

interface CookieJar {
  cookies: {
    set: (name: string, value: string, opts?: any) => unknown;
    delete: (name: string) => unknown;
  };
}

export function setStaffCookie(res: CookieJar, rawToken: string, expiresAt: Date) {
  res.cookies.set(STAFF_COOKIE, rawToken, { ...base(), expires: expiresAt });
}

export function setCustomerCookie(res: CookieJar, rawToken: string) {
  res.cookies.set(CUSTOMER_COOKIE, rawToken, { ...base(), maxAge: 30 * 24 * 60 * 60 });
}

export function clearAuthCookies(res: CookieJar) {
  res.cookies.delete(STAFF_COOKIE);
  res.cookies.delete(CUSTOMER_COOKIE);
}

/** Reads one cookie from a plain Request or a NextRequest alike. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}
