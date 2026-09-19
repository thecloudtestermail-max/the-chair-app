// src/app/api/staff/route.ts
//
// Tenant-admin staff management, deliberately scoped to receptionist/barber
// only — the super_admin remains the sole creator of admin accounts (at
// tenant setup, see api/platform/tenants/route.ts), so this endpoint never
// lists, creates, or deletes a role:'admin' user, even for an admin caller.
// See src/lib/staffAuth.ts for the invite-code mechanics.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { createStaffInvite, sendStaffInviteEmail } from '@/lib/staffAuth';
import { User } from '@/lib/types';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

const MANAGEABLE_ROLES = ['receptionist', 'barber'] as const;

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['admin']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDatabase();
    const staff = await db
      .collection<User>('users')
      .find({ tenantId: session.tenantId, role: { $in: [...MANAGEABLE_ROLES] } })
      .toArray();

    return NextResponse.json(
      staff.map(({ passwordHash, ...rest }) => ({ ...rest, status: passwordHash ? 'active' : 'invited' }))
    );
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch staff', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireRole(req, ['admin']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, email, role, barberId } = body;

    if (!name || !email || !role) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }
    if (!MANAGEABLE_ROLES.includes(role)) {
      return NextResponse.json({ message: 'Role must be receptionist or barber' }, { status: 400 });
    }

    const db = await getDatabase();

    const existing = await db.collection('users').findOne({ tenantId: session.tenantId, email });
    if (existing) {
      return NextResponse.json({ message: 'A staff account with that email already exists at this salon' }, { status: 409 });
    }

    let linkedBarberId: ObjectId | undefined;
    if (role === 'barber' && barberId) {
      const barber = await db.collection('barbers').findOne({ _id: new ObjectId(barberId), tenantId: session.tenantId });
      if (!barber) return NextResponse.json({ message: 'Barber profile not found' }, { status: 404 });
      linkedBarberId = barber._id;
    }

    const user: User = {
      tenantId: session.tenantId,
      username: name,
      email,
      passwordHash: '', // pending — see the User.passwordHash comment in lib/types.ts
      role,
      barberId: linkedBarberId,
      createdAt: new Date(),
    };
    const result = await db.collection<User>('users').insertOne(user);

    const inviteCode = await createStaffInvite(result.insertedId, session.tenantId, email);

    const tenant = await db.collection('tenants').findOne({ _id: session.tenantId });
    const emailed = await sendStaffInviteEmail({
      tenantId: session.tenantId,
      tenantName: tenant?.name || 'your salon',
      employeeName: name,
      email,
      role,
      code: inviteCode,
    });

    return NextResponse.json(
      { _id: result.insertedId, name, email, role, status: 'invited', inviteCode, emailed },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to add staff member', error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireRole(req, ['admin']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ message: 'Missing staff ID' }, { status: 400 });

  try {
    const db = await getDatabase();
    const result = await db.collection<User>('users').findOneAndDelete({
      _id: new ObjectId(id),
      tenantId: session.tenantId,
      role: { $in: [...MANAGEABLE_ROLES] },
    });
    if (!result) return NextResponse.json({ message: 'Staff member not found' }, { status: 404 });

    await db.collection('staffInvites').deleteMany({ userId: result._id });
    await db.collection('sessions').deleteMany({ subjectId: result._id, subjectType: 'user' });

    return NextResponse.json({ message: 'Staff member removed' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to remove staff member', error: error.message }, { status: 500 });
  }
}
