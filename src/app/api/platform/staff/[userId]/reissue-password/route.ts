// src/app/api/platform/staff/[userId]/reissue-password/route.ts
//
// Platform-admin equivalent of api/staff/resend/route.ts, minus the
// tenant-session scoping — a super_admin can reissue access for ANY staff
// member at ANY tenant (including a salon's own admin, who the tenant-
// scoped version can't touch since it only allows 'receptionist'/'barber').
// Same effect otherwise: new temp password, fresh welcome PDF, every
// existing session for that user ended.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { issueTempPassword, sendStaffWelcomeEmail } from '@/lib/staffAuth';
import { buildWelcomePdfBase64 } from '@/lib/welcomePdf';
import { recordAuditLog } from '@/lib/auditLog';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { userId } = await params;
    if (!ObjectId.isValid(userId)) return NextResponse.json({ message: 'Invalid staff ID' }, { status: 400 });

    const db = await getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId), role: { $ne: 'super_admin' } });
    if (!user) return NextResponse.json({ message: 'Staff member not found' }, { status: 404 });

    const tenant = user.tenantId ? await db.collection('tenants').findOne({ _id: user.tenantId }) : null;
    const salonName = tenant?.name || 'their salon';

    const temp = await issueTempPassword(user._id);

    let welcomePdf: string | null = null;
    try {
      welcomePdf = await buildWelcomePdfBase64({
        role: user.role,
        salonName,
        tenantSlug: tenant?.slug || '',
        personName: user.username,
        email: user.email,
        password: temp.password,
        mustChangePassword: true,
        passwordExpiresAt: temp.expiresAt,
        issuedBy: 'Platform admin',
      });
    } catch (err) {
      console.error('Welcome PDF failed:', err);
    }

    const emailed = tenant
      ? await sendStaffWelcomeEmail({ tenantName: salonName, tenantSlug: tenant.slug, employeeName: user.username, email: user.email, role: user.role })
      : false;

    await recordAuditLog({
      actor: session,
      action: 'staff.password_reissued',
      targetType: 'staff',
      targetId: user._id,
      meta: { staffEmail: user.email, tenantName: salonName },
    });

    return NextResponse.json({ tempPassword: temp.password, tempPasswordExpiresAt: temp.expiresAt, welcomePdf, emailed });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to reissue access', error: error.message }, { status: 500 });
  }
}
