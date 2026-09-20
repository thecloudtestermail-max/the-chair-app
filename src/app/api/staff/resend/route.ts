// src/app/api/staff/resend/route.ts
//
// "Reissue access": gives a team member a NEW temporary password and a fresh
// welcome PDF. Works for anyone at the salon, not only people who never
// signed in: it is also the fix for a lost password when no email provider
// is configured. Their old password stops working and every session they
// have is ended.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { issueTempPassword, sendStaffWelcomeEmail } from '@/lib/staffAuth';
import { buildWelcomePdfBase64 } from '@/lib/welcomePdf';
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

    const temp = await issueTempPassword(user._id);

    const tenant = await db.collection('tenants').findOne({ _id: session.tenantId });
    const salonName = tenant?.name || 'your salon';
    const issuer = await db.collection('users').findOne({ _id: session.subjectId }, { projection: { username: 1 } });

    let welcomePdf: string | null = null;
    try {
      welcomePdf = await buildWelcomePdfBase64({
        role: user.role, salonName, tenantSlug: tenant?.slug || '', personName: user.username, email: user.email,
        password: temp.password, mustChangePassword: true, passwordExpiresAt: temp.expiresAt, issuedBy: issuer?.username,
      });
    } catch (err) {
      console.error('Welcome PDF failed:', err);
    }

    const emailed = await sendStaffWelcomeEmail({ tenantName: salonName, tenantSlug: tenant?.slug || '', employeeName: user.username, email: user.email, role: user.role });

    return NextResponse.json({ tempPassword: temp.password, tempPasswordExpiresAt: temp.expiresAt, welcomePdf, emailed });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to reissue access', error: error.message }, { status: 500 });
  }
}
