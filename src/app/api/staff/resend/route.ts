// src/app/api/staff/resend/route.ts
//
// Regenerates a still-pending staff member's setup code — the original
// expires after 7 days (see staffAuth.ts), or an admin may just need to
// read it off the screen a second time since it's never stored anywhere
// retrievable after creation.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { createStaffInvite, sendStaffInviteEmail } from '@/lib/staffAuth';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireRole(req, ['admin']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ message: 'Missing staff ID' }, { status: 400 });

    const db = await getDatabase();
    const user = await db.collection('users').findOne({
      _id: new ObjectId(id),
      tenantId: session.tenantId,
      role: { $in: ['receptionist', 'barber'] },
    });
    if (!user) return NextResponse.json({ message: 'Staff member not found' }, { status: 404 });
    if (user.passwordHash) {
      return NextResponse.json({ message: 'This account is already active' }, { status: 409 });
    }

    const inviteCode = await createStaffInvite(user._id, session.tenantId, user.email);

    const tenant = await db.collection('tenants').findOne({ _id: session.tenantId });
    const emailed = await sendStaffInviteEmail({
      tenantId: session.tenantId,
      tenantName: tenant?.name || 'your salon',
      employeeName: user.username,
      email: user.email,
      role: user.role,
      code: inviteCode,
    });

    return NextResponse.json({ inviteCode, emailed });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to regenerate code', error: error.message }, { status: 500 });
  }
}
