// src/app/api/platform/security/sessions/route.ts
//
// Force-revoke every active staff/admin session for one account — the
// response to a suspicious login-attempts cluster, or simply "sign this
// person out everywhere right now" without waiting for a password reissue.
// Reuses lib/auth.ts's deleteSessionsForSubject; scoped to the staff
// `sessions` collection (subjectType 'user'), not customer sessions.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { deleteSessionsForSubject } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';
import { normalizeEmail } from '@/lib/identity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const email = normalizeEmail(body?.email);
    if (!email) return NextResponse.json({ message: 'Email required' }, { status: 400 });

    const db = await getDatabase();
    const users = await db.collection('users').find({ email }).toArray();
    if (users.length === 0) return NextResponse.json({ message: 'No account found with that email' }, { status: 404 });

    await Promise.all(users.map((u) => deleteSessionsForSubject(u._id)));

    await recordAuditLog({
      actor: session,
      action: 'session.revoked',
      targetType: 'session',
      meta: { email, accountsAffected: users.length },
    });

    return NextResponse.json({ message: 'Sessions revoked', accountsAffected: users.length });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to revoke sessions', error: error.message }, { status: 500 });
  }
}
