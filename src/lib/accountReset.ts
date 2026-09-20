// src/lib/accountReset.ts
//
// The operator's side of "email geehyness22@gmail.com to reset your password"
// (what the app tells people when email delivery isn't configured). Gives every
// account that email owns (the customer record and any staff roles at any
// salon) a NEW temporary password, ends all their sessions, and returns the
// plain password once for the operator to send back. The platform super_admin
// is never touched: its password only changes via create-super-admin.
//
// Takes the database as an argument so the CLI (scripts/reset-password.ts) and
// the tests share the same code.
import { hashPassword } from './auth';
import { generateTempPassword } from './password';
import { normalizeEmail } from './identity';

export const RESET_PASSWORD_TTL_DAYS = 7;

export interface ResetOutcome {
  email: string;
  password: string;
  expiresAt: Date;
  staffAccounts: number;
  customerAccount: boolean;
}

/** Returns null when the email owns no resettable account. */
export async function resetPasswordForEmail(db: any, rawEmail: string): Promise<ResetOutcome | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;

  const users = ((await db.collection('users').find({ email }).toArray()) as any[]).filter((u) => u.role !== 'super_admin');
  const customer = await db.collection('customers').findOne({ email }, { projection: { _id: 1 } });
  if (!users.length && !customer) return null;

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_PASSWORD_TTL_DAYS * 24 * 60 * 60_000);

  for (const u of users) {
    await db.collection('users').updateOne(
      { _id: u._id },
      { $set: { passwordHash, passwordChangedAt: now, mustChangePassword: true, tempPasswordExpiresAt: expiresAt } }
    );
    await db.collection('sessions').deleteMany({ subjectId: u._id });
  }
  if (customer) {
    await db.collection('customers').updateOne({ _id: customer._id }, { $set: { passwordHash, passwordChangedAt: now } });
    await db.collection('customerClaimSessions').deleteMany({ customerId: customer._id });
  }
  // Any emailed reset link that was already outstanding must not outlive this.
  await db.collection('passwordResets').deleteMany({ email });

  return { email, password, expiresAt, staffAccounts: users.length, customerAccount: Boolean(customer) };
}
