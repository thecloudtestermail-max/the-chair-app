// src/app/api/platform/admins/route.ts
//
// Managing OTHER super_admin accounts. Deliberately separate from
// api/platform/staff — a platform admin has no tenantId and isn't a
// "staff member" of any salon, and inviting one skips the welcome-PDF flow
// (that system's WelcomeRole only covers admin/receptionist/barber, all of
// which are tenant roles): credentials are shown once in the response and
// a plain notice email is sent instead.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { hashPassword } from '@/lib/auth';
import { generateTempPassword } from '@/lib/password';
import { isValidEmail, normalizeEmail } from '@/lib/identity';
import { sendEmail } from '@/lib/email';
import { SITE_URL } from '@/lib/site';
import { recordAuditLog } from '@/lib/auditLog';
import { TEMP_PASSWORD_TTL_DAYS } from '@/lib/staffAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDatabase();
    const admins = await db
      .collection('users')
      .find({ role: 'super_admin' }, { projection: { passwordHash: 0 } })
      .sort({ createdAt: 1 })
      .toArray();

    return NextResponse.json(admins.map((a) => ({ ...a, isSelf: a._id.equals(session.subjectId) })));
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to load admins', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const email = normalizeEmail(body?.email);
    const username = typeof body?.username === 'string' ? body.username.trim() : '';

    if (!username || username.length < 2) return NextResponse.json({ message: 'Enter a name' }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ message: 'Enter a valid email address' }, { status: 400 });

    const db = await getDatabase();
    const existing = await db.collection('users').findOne({ email });
    if (existing) return NextResponse.json({ message: 'An account with this email already exists' }, { status: 409 });

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const passwordExpiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_DAYS * 24 * 60 * 60_000);

    const result = await db.collection('users').insertOne({
      username,
      email,
      passwordHash,
      role: 'super_admin',
      mustChangePassword: true,
      tempPasswordExpiresAt: passwordExpiresAt,
      welcomeIssuedAt: new Date(),
      createdAt: new Date(),
    });

    const emailed = await sendEmail({
      to: email,
      subject: 'You now have platform admin access — The Chair App',
      html:
        `<p>Hi ${username},</p>` +
        `<p>You've been given <strong>platform admin</strong> access to The Chair App.</p>` +
        `<p>Sign in at <a href="${SITE_URL}/admin/login">${SITE_URL}/admin/login</a> with this email address. Your temporary password will be given to you separately by whoever added you — you'll be asked to choose your own the first time you sign in.</p>`,
    });

    await recordAuditLog({
      actor: session,
      action: 'admin.invited',
      targetType: 'admin',
      targetId: result.insertedId,
      meta: { email, username },
    });

    return NextResponse.json(
      { _id: result.insertedId, email, username, tempPassword, tempPasswordExpiresAt: passwordExpiresAt, emailed },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to add admin', error: error.message }, { status: 500 });
  }
}
