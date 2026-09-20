// src/app/api/auth/password/route.ts
//
// Change your own password while signed in (customers and staff alike). This
// is also how a staff member replaces their temporary password: it reads the
// session directly, so it works even while requireRole() is refusing the
// session for everything else.
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { hashPassword, verifyPassword, verifySessionToken, deleteSessionsForSubject } from '@/lib/auth';
import { deleteCustomerSessions, verifyClaimSession } from '@/lib/customerAuth';
import { readCookie, STAFF_COOKIE, CUSTOMER_COOKIE } from '@/lib/authCookies';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { validatePassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    const staffToken = readCookie(request, STAFF_COOKIE);
    const customerToken = readCookie(request, CUSTOMER_COOKIE);
    const staffSession = await verifySessionToken(staffToken);
    const customerSession = await verifyClaimSession(customerToken);

    if (staffSession?.role === 'super_admin' && !customerSession) {
      return NextResponse.json({ message: 'Platform admin passwords are changed with the create-super-admin script.' }, { status: 403 });
    }
    if (!staffSession && !customerSession) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });

    const db = await getDatabase();
    const staffUser = staffSession && staffSession.role !== 'super_admin'
      ? ((await db.collection('users').findOne({ _id: staffSession.subjectId })) as any)
      : null;
    const customer = customerSession ? ((await db.collection('customers').findOne({ _id: customerSession.customerId })) as any) : null;
    const email: string | undefined = staffUser?.email ?? customer?.email;
    if (!email) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });

    if (!currentPassword) return NextResponse.json({ message: 'Enter your current password' }, { status: 400 });
    const problem = validatePassword(newPassword, email);
    if (problem) return NextResponse.json({ message: problem }, { status: 400 });
    if (newPassword === currentPassword) return NextResponse.json({ message: 'Choose a password different from your current one' }, { status: 400 });

    const ip = clientIp(request);
    if (await isRateLimited('login', email, ip)) {
      return NextResponse.json({ message: 'Too many attempts. Please wait a few minutes and try again.' }, { status: 429 });
    }

    // One email = one password: update every account for this email that the
    // current password actually unlocks.
    const accounts: Array<{ kind: 'user' | 'customer'; doc: any }> = [];
    const users = ((await db.collection('users').find({ email }).toArray()) as any[]).filter((u) => u.role !== 'super_admin');
    for (const u of users) accounts.push({ kind: 'user', doc: u });
    const custDoc = (await db.collection('customers').findOne({ email })) as any;
    if (custDoc) accounts.push({ kind: 'customer', doc: custDoc });

    const targets: typeof accounts = [];
    for (const a of accounts) {
      if (a.doc.passwordHash && (await verifyPassword(currentPassword, a.doc.passwordHash))) targets.push(a);
    }
    if (!targets.length) {
      await recordAttempt('login', email, ip);
      return NextResponse.json({ message: 'Your current password is incorrect' }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    for (const a of targets) {
      if (a.kind === 'user') {
        await db.collection('users').updateOne({ _id: a.doc._id }, { $set: { passwordHash, passwordChangedAt: now, mustChangePassword: false } });
        const isCurrent = staffUser && a.doc._id.toString() === staffUser._id.toString();
        await deleteSessionsForSubject(a.doc._id, isCurrent ? staffToken : undefined);
        if (isCurrent) await db.collection('sessions').updateMany({ subjectId: a.doc._id }, { $set: { mustChangePassword: false } });
      } else {
        await db.collection('customers').updateOne({ _id: a.doc._id }, { $set: { passwordHash, passwordChangedAt: now } });
        const isCurrent = customer && a.doc._id.toString() === customer._id.toString();
        await deleteCustomerSessions(a.doc._id, isCurrent ? customerToken : undefined);
      }
    }

    return NextResponse.json({ message: 'Password updated. Other devices have been signed out.' });
  } catch (error: any) {
    console.error('Change password error:', error);
    return NextResponse.json({ message: 'Could not change your password. Please try again.' }, { status: 500 });
  }
}
