// src/lib/staffAuth.ts
//
// Issuing a staff member's first credentials. Staff sign in with email +
// password exactly like everyone else; what differs is only how the first
// password arrives: the salon admin adds them, the app generates a TEMPORARY
// password, and it is printed once in their welcome PDF (lib/welcomePdf).
// It is stored only as a bcrypt hash, works until it expires, and forces the
// person to choose their own at first sign-in. Replaces the old 8-character
// setup-code flow and its separate "Have a setup code?" screen.
import { getDatabase } from './mongodb';
import { hashPassword } from './auth';
import { generateTempPassword } from './password';
import { sendEmail } from './email';
import { escapeHtml } from './text';
import { SITE_URL } from './site';
import { ObjectId } from 'mongodb';

export const TEMP_PASSWORD_TTL_DAYS = 7;

/**
 * Gives a user a new temporary password (first issue, or a reissue after a
 * lockout), ends all their existing sessions, and returns the plain value
 * exactly once. The caller must hand it over immediately and never log it.
 */
export async function issueTempPassword(userId: ObjectId): Promise<{ password: string; expiresAt: Date }> {
  const db = await getDatabase();
  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_DAYS * 24 * 60 * 60_000);

  await db.collection('users').updateOne(
    { _id: userId },
    { $set: { passwordHash, mustChangePassword: true, tempPasswordExpiresAt: expiresAt, welcomeIssuedAt: new Date() } }
  );
  await db.collection('sessions').deleteMany({ subjectId: userId });

  return { password, expiresAt };
}

/**
 * Best-effort email telling a new team member where to sign in. It never
 * contains the password: that is only in the PDF the admin hands over.
 */
export async function sendStaffWelcomeEmail(params: {
  tenantName: string;
  tenantSlug: string;
  employeeName: string;
  email: string;
  role: string;
}): Promise<boolean> {
  const { tenantName, tenantSlug, employeeName, email, role } = params;
  const url = `${SITE_URL}/t/${tenantSlug}/login`;
  return sendEmail({
    to: email,
    subject: `You've been added as ${role} at ${tenantName}`,
    html:
      `<p>Hi ${escapeHtml(employeeName)},</p>` +
      `<p>You've been added as a <strong>${escapeHtml(role)}</strong> at <strong>${escapeHtml(tenantName)}</strong> on The Chair App.</p>` +
      `<p>Sign in with this email address at <a href="${url}">${url}</a>. Your manager will give you your temporary password in your welcome guide. You'll choose your own password the first time you sign in.</p>`,
  });
}
