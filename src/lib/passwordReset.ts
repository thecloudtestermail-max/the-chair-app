// src/lib/passwordReset.ts
//
// Emailed password reset. One email = one password across every account that
// email owns (the customer record and any staff roles at any salon), so a
// reset updates all of them and ends all their sessions. The super admin is
// excluded on purpose: platform credentials are only ever changed with the
// create-super-admin script.
import crypto from 'crypto';
import { getDatabase } from './mongodb';
import { hashPassword, hashToken } from './auth';
import { validatePassword } from './password';
import { SITE_URL } from './site';
import type { PasswordReset, User } from './types';

const TTL_MINUTES = 60;

async function staffForEmail(email: string): Promise<Array<User & { _id: any }>> {
  const db = await getDatabase();
  const users = await db.collection<User>('users').find({ email }).toArray();
  return (users as any[]).filter((u) => u.role !== 'super_admin');
}

/** Creates a reset token when this email owns any account. Returns the raw token, or null if there is nothing to reset. */
export async function createPasswordReset(email: string): Promise<string | null> {
  const db = await getDatabase();
  const hasStaff = (await staffForEmail(email)).length > 0;
  const hasCustomer = Boolean(await db.collection('customers').findOne({ email }, { projection: { _id: 1 } }));
  if (!hasStaff && !hasCustomer) return null;

  const rawToken = crypto.randomBytes(32).toString('hex');
  await db.collection('passwordResets').deleteMany({ email }); // one live link per email
  const record: PasswordReset = {
    tokenHash: hashToken(rawToken),
    email,
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
    createdAt: new Date(),
  };
  await db.collection<PasswordReset>('passwordResets').insertOne(record);
  return rawToken;
}

/** The token travels in the URL fragment so it never reaches server logs or Referer headers. */
export function resetUrl(rawToken: string, tenantSlug?: string): string {
  const frag = new URLSearchParams({ token: rawToken });
  if (tenantSlug) frag.set('from', tenantSlug);
  return `${SITE_URL}/reset-password#${frag.toString()}`;
}

export type ResetResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'invalid' | 'weak'; message: string };

/** Verifies a token and sets the new password on every account for that email. Single-use. */
export async function consumePasswordReset(rawToken: string, newPassword: string): Promise<ResetResult> {
  const db = await getDatabase();
  const record = await db
    .collection<PasswordReset>('passwordResets')
    .findOne({ tokenHash: hashToken(rawToken), expiresAt: { $gt: new Date() } });
  if (!record) return { ok: false, reason: 'invalid', message: 'This reset link is invalid or has expired. Request a new one.' };

  const problem = validatePassword(newPassword, record.email);
  if (problem) return { ok: false, reason: 'weak', message: problem };

  await db.collection('passwordResets').deleteOne({ _id: record._id }); // single-use

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  for (const user of await staffForEmail(record.email)) {
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { passwordHash, passwordChangedAt: now, mustChangePassword: false } }
    );
    await db.collection('sessions').deleteMany({ subjectId: user._id });
  }

  const customer = await db.collection('customers').findOne({ email: record.email }, { projection: { _id: 1 } });
  if (customer) {
    await db.collection('customers').updateOne({ _id: customer._id }, { $set: { passwordHash, passwordChangedAt: now } });
    await db.collection('customerClaimSessions').deleteMany({ customerId: customer._id });
  }

  return { ok: true, email: record.email };
}
