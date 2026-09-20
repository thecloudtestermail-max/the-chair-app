// src/app/api/staff/route.ts
//
// Tenant-admin staff management, deliberately scoped to receptionist/barber
// only — the super_admin remains the sole creator of admin accounts (at
// tenant setup, see api/platform/tenants/route.ts), so this endpoint never
// lists, creates, or deletes a role:'admin' user, even for an admin caller.
//
// Adding someone creates their account with a TEMPORARY password and returns
// a welcome PDF (sign-in details + role guide + QR pages). Both exist only in
// this response: the password is stored hashed, the PDF is never stored. See
// src/lib/staffAuth.ts and src/lib/welcomePdf.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { issueTempPassword, sendStaffWelcomeEmail } from '@/lib/staffAuth';
import { buildWelcomePdfBase64 } from '@/lib/welcomePdf';
import { isValidEmail, normalizeEmail, slugify } from '@/lib/identity';
import { Barber, User } from '@/lib/types';
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

    // 'invited' = has not yet replaced the temporary password (or is a legacy
    // account with no password at all); 'active' = chose their own.
    return NextResponse.json(
      staff.map(({ passwordHash, mustChangePassword, ...rest }) => ({
        ...rest,
        status: !passwordHash || mustChangePassword ? 'invited' : 'active',
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch staff', error: error.message }, { status: 500 });
  }
}

/** A slug unique within the salon: "marcus", then "marcus-2", "marcus-3"... */
async function uniqueBarberSlug(db: any, tenantId: ObjectId, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await db.collection('barbers').findOne({ tenantId, slug }, { projection: { _id: 1 } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function POST(req: NextRequest) {
  const session = await requireRole(req, ['admin']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = normalizeEmail(body.email);
    const { role, barberId } = body;

    if (!name || !email || !role) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ message: 'Enter a valid email address' }, { status: 400 });
    }
    if (!MANAGEABLE_ROLES.includes(role)) {
      return NextResponse.json({ message: 'Role must be receptionist or barber' }, { status: 400 });
    }

    const db = await getDatabase();

    const existing = await db.collection('users').findOne({ tenantId: session.tenantId, email });
    if (existing) {
      return NextResponse.json({ message: 'A staff account with that email already exists at this salon' }, { status: 409 });
    }

    // A barber needs a profile to appear in bookings and to see "their own"
    // appointments. Link an existing one if given; otherwise make one, so a
    // new barber is never left with an account that can see nothing.
    let linkedBarberId: ObjectId | undefined;
    if (role === 'barber') {
      if (barberId) {
        const barber = await db.collection('barbers').findOne({ _id: new ObjectId(barberId), tenantId: session.tenantId });
        if (!barber) return NextResponse.json({ message: 'Barber profile not found' }, { status: 404 });
        linkedBarberId = barber._id;
      } else {
        const profile: Barber = {
          tenantId: session.tenantId,
          name,
          slug: await uniqueBarberSlug(db, session.tenantId, name),
          dailyAvailability: [],
        };
        linkedBarberId = (await db.collection<Barber>('barbers').insertOne(profile)).insertedId;
      }
    }

    const user: User = {
      tenantId: session.tenantId,
      username: name,
      email,
      passwordHash: '', // replaced by issueTempPassword() just below
      role,
      barberId: linkedBarberId,
      createdAt: new Date(),
    };
    const result = await db.collection<User>('users').insertOne(user);
    const temp = await issueTempPassword(result.insertedId);

    const tenant = await db.collection('tenants').findOne({ _id: session.tenantId });
    const salonName = tenant?.name || 'your salon';
    const issuer = await db.collection('users').findOne({ _id: session.subjectId }, { projection: { username: 1 } });

    let welcomePdf: string | null = null;
    try {
      welcomePdf = await buildWelcomePdfBase64({
        role, salonName, tenantSlug: tenant?.slug || '', personName: name, email,
        password: temp.password, mustChangePassword: true, passwordExpiresAt: temp.expiresAt, issuedBy: issuer?.username,
      });
    } catch (err) {
      // The account exists either way; the admin still gets the password on screen.
      console.error('Welcome PDF failed:', err);
    }

    const emailed = await sendStaffWelcomeEmail({ tenantName: salonName, tenantSlug: tenant?.slug || '', employeeName: name, email, role });

    return NextResponse.json(
      {
        _id: result.insertedId, name, email, role, status: 'invited',
        tempPassword: temp.password, tempPasswordExpiresAt: temp.expiresAt, welcomePdf, emailed,
      },
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

    await db.collection('sessions').deleteMany({ subjectId: result._id, subjectType: 'user' });

    return NextResponse.json({ message: 'Staff member removed' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to remove staff member', error: error.message }, { status: 500 });
  }
}
