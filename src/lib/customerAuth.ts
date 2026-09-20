// src/lib/customerAuth.ts
//
// Customer sessions. Customers sign in with email + password like everyone
// else (see api/auth/login); this module only owns the customer-side session
// store. Deliberately NOT merged into staff `sessions`: a customer token
// carries no role and can never satisfy requireRole().
import crypto from 'crypto';
import { getDatabase } from './mongodb';
import { CustomerClaimSession } from './types';
import { ObjectId } from 'mongodb';

const SESSION_TTL_DAYS = 30;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Starts a customer session; the caller sets the returned token as the customerClaim cookie. */
export async function createCustomerSession(customerId: ObjectId): Promise<{ rawToken: string; expiresAt: Date }> {
  const db = await getDatabase();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000);
  const session: CustomerClaimSession = { tokenHash: hashToken(rawToken), customerId, expiresAt };
  await db.collection<CustomerClaimSession>('customerClaimSessions').insertOne(session);
  return { rawToken, expiresAt };
}

/** Resolves a customer cookie's raw token to a customerId, or null if missing/expired. */
export async function verifyClaimSession(rawToken: string | undefined): Promise<{ customerId: ObjectId } | null> {
  if (!rawToken) return null;
  const db = await getDatabase();
  const session = await db
    .collection<CustomerClaimSession>('customerClaimSessions')
    .findOne({ tokenHash: hashToken(rawToken), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return { customerId: session.customerId };
}

export async function deleteClaimSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const db = await getDatabase();
  await db.collection('customerClaimSessions').deleteOne({ tokenHash: hashToken(rawToken) });
}

/** Ends every customer session for one customer, optionally keeping the current one. */
export async function deleteCustomerSessions(customerId: ObjectId, exceptRawToken?: string): Promise<void> {
  const db = await getDatabase();
  const filter: Record<string, any> = { customerId };
  if (exceptRawToken) filter.tokenHash = { $nin: [hashToken(exceptRawToken)] };
  await db.collection('customerClaimSessions').deleteMany(filter);
}
