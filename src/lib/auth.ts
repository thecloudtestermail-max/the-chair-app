// src/lib/auth.ts
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDatabase } from './mongodb';
import { Session } from './types';
import { ObjectId } from 'mongodb';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A real bcrypt hash of a value nobody can supply. Comparing against it when
// no account matched makes "unknown email" cost the same as "wrong password",
// so response time never reveals whether an email has an account.
export const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8lfXcnAmxbjHDlxpqZR8P1XHqxhqLm';

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function createSession(
  subjectId: ObjectId,
  subjectType: 'user' | 'customer',
  role: string,
  tenantId?: ObjectId,
  barberId?: ObjectId,
  mustChangePassword = false
): Promise<{ rawToken: string; expiresAt: Date }> {
  const db = await getDatabase();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session: Session = { tokenHash, subjectId, subjectType, tenantId, barberId, role, expiresAt };
  if (mustChangePassword) session.mustChangePassword = true;

  await db.collection('sessions').insertOne(session);
  return { rawToken, expiresAt };
}

/**
 * Resolves a session cookie to its session, or null. A session belonging to a
 * suspended salon is treated as expired, so suspending a tenant takes effect
 * immediately instead of when each staff member's 7-day session runs out.
 */
export async function verifySessionToken(rawToken: string | undefined): Promise<Session | null> {
  if (!rawToken) return null;

  const db = await getDatabase();
  const session = await db.collection<Session>('sessions').findOne({
    tokenHash: hashToken(rawToken),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  if (session.tenantId) {
    const tenant = await db.collection('tenants').findOne({ _id: session.tenantId }, { projection: { status: 1 } });
    if (tenant && tenant.status === 'suspended') return null;
  }

  return session;
}

export async function deleteSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const db = await getDatabase();
  await db.collection('sessions').deleteOne({ tokenHash: hashToken(rawToken) });
}

/** Ends every staff session for a user, optionally keeping the one making the request. */
export async function deleteSessionsForSubject(subjectId: ObjectId, exceptRawToken?: string): Promise<void> {
  const db = await getDatabase();
  const filter: Record<string, any> = { subjectId };
  if (exceptRawToken) filter.tokenHash = { $nin: [hashToken(exceptRawToken)] };
  await db.collection('sessions').deleteMany(filter);
}
