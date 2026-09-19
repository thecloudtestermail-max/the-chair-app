// src/lib/staffAuth.ts
//
// A tenant admin adding a receptionist or barber login — the gap this
// closes: previously the ONLY way a `users` document with role
// receptionist/barber could exist was by hand in the database, because the
// founding admin (created by the platform super_admin at tenant setup —
// see api/platform/tenants/route.ts) was the sole account creation path in
// the whole app. Deliberately scoped to admin -> receptionist/barber only:
// the super_admin remains the only one who creates admin accounts (at
// tenant creation), same boundary as before.
//
// Shape/lifecycle deliberately mirrors customerAuth.ts's claim code (hashed,
// single-use, expiring) rather than inventing a second pattern.
//
// The code is ALWAYS shown on-screen to the admin who created the account
// (see dashboard/staff's setup-code panel) — emailing it via
// sendStaffInviteEmail below is a bonus delivery channel on top of that,
// not a replacement for it, since there's no guarantee EmailJS is
// configured (see lib/email.ts).
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDatabase } from './mongodb';
import { sendEmail } from './email';
import { StaffInvite, User } from './types';
import { ObjectId } from 'mongodb';

const CODE_TTL_DAYS = 7;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// 8 chars from an unambiguous alphabet (no 0/O/1/I/l) — meant to be read
// off a screen and relayed verbally or by text, not typed from memory.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Creates (or resets, for an existing pending invite) a staff account's one-time setup code. Returns the raw code — shown once, never retrievable again. */
export async function createStaffInvite(userId: ObjectId, tenantId: ObjectId, email: string): Promise<string> {
  const db = await getDatabase();
  const code = generateInviteCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60_000);

  // One live invite per user — replace rather than accumulate.
  await db.collection('staffInvites').deleteMany({ userId });
  const invite: StaffInvite = { codeHash, userId, email, tenantId, expiresAt };
  await db.collection<StaffInvite>('staffInvites').insertOne(invite);

  return code;
}

/** Emails a staff member's setup code, if EmailJS is configured. Returns whether it actually sent — callers use this to tell the admin whether they still need to relay the code manually. */
export async function sendStaffInviteEmail(params: {
  tenantId: ObjectId;
  tenantName: string;
  employeeName: string;
  email: string;
  role: string;
  code: string;
}): Promise<boolean> {
  const { tenantName, employeeName, email, role, code } = params;
  return sendEmail({
    to: email,
    subject: `You've been added as ${role} at ${tenantName}`,
    html: `<p>Hi ${employeeName},</p><p>You've been added as a <strong>${role}</strong> at <strong>${tenantName}</strong>. Go to the staff sign-in page, choose "Have a setup code?", and enter this code with your email to set your own password:</p><p style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:0.1em;">${code}</p><p>This code expires in 7 days.</p>`,
    code,
  });
}

/** Verifies a staff invite code and, on success, activates the account with the chosen password. Single-use — deletes the invite either way once matched. */
export async function acceptStaffInvite(
  email: string,
  code: string,
  password: string
): Promise<{ user: User & { _id: ObjectId } } | null> {
  const db = await getDatabase();
  const codeHash = hashToken(code);
  const invite = await db.collection<StaffInvite>('staffInvites').findOne({ email, codeHash, expiresAt: { $gt: new Date() } });
  if (!invite) return null;

  await db.collection('staffInvites').deleteOne({ _id: invite._id }); // single-use

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const result = await db.collection<User>('users').findOneAndUpdate(
    { _id: invite.userId, email, passwordHash: '' }, // passwordHash:'' guards against re-activating an already-active account
    { $set: { passwordHash } },
    { returnDocument: 'after' }
  );
  if (!result) return null;

  return { user: result as User & { _id: ObjectId } };
}
