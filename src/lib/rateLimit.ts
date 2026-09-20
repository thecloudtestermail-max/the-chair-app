// src/lib/rateLimit.ts
//
// Throttling for every credential-guessing surface (sign-in, register,
// forgot/reset password, admin sign-in). Replaces the old per-email counter,
// which anyone could use to lock a real user out just by typing their email
// six times. Three independent ceilings over a 15-minute window:
//   - per (email + IP): a real user mistyping only ever blocks themselves
//   - per IP:           one machine spraying many emails
//   - per email:        a distributed attack on one account (higher ceiling)
// Sign-in records FAILURES only; register/forgot/reset record every attempt.
import { getDatabase } from './mongodb';
import type { LoginAttempt } from './types';

export type RateScope = LoginAttempt['scope'];

const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { perPair: 5, perIp: 25, perEmail: 40 };

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function isRateLimited(scope: RateScope, email: string, ip: string): Promise<boolean> {
  const db = await getDatabase();
  const since = new Date(Date.now() - WINDOW_MS);
  const col = db.collection('loginAttempts');
  const [pair, byIp, byEmail] = await Promise.all([
    col.countDocuments({ scope, email, ip, createdAt: { $gt: since } }),
    col.countDocuments({ scope, ip, createdAt: { $gt: since } }),
    col.countDocuments({ scope, email, createdAt: { $gt: since } }),
  ]);
  return pair >= LIMITS.perPair || byIp >= LIMITS.perIp || byEmail >= LIMITS.perEmail;
}

export async function recordAttempt(scope: RateScope, email: string, ip: string): Promise<void> {
  const db = await getDatabase();
  await db.collection('loginAttempts').insertOne({ scope, email, ip, createdAt: new Date() });
}
