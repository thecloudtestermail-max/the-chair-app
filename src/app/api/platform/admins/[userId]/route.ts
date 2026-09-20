// src/app/api/platform/admins/[userId]/route.ts
//
// Removing a platform admin. Two guards that can't be bypassed from the
// client: can't remove yourself (avoids accidentally locking yourself out
// with no other way back in), and can't remove the last remaining
// super_admin (would lock EVERYONE out — no other door reaches /admin).
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { deleteSessionsForSubject } from '@/lib/auth';
import { recordAuditLog } from '@/lib/auditLog';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { userId } = await params;
    if (!ObjectId.isValid(userId)) return NextResponse.json({ message: 'Invalid admin ID' }, { status: 400 });
    const targetId = new ObjectId(userId);

    if (targetId.equals(session.subjectId)) {
      return NextResponse.json({ message: "You can't remove your own admin access" }, { status: 400 });
    }

    const db = await getDatabase();
    const target = await db.collection('users').findOne({ _id: targetId, role: 'super_admin' });
    if (!target) return NextResponse.json({ message: 'Admin not found' }, { status: 404 });

    const adminCount = await db.collection('users').countDocuments({ role: 'super_admin' });
    if (adminCount <= 1) {
      return NextResponse.json({ message: 'At least one platform admin must remain' }, { status: 409 });
    }

    await db.collection('users').deleteOne({ _id: targetId });
    await deleteSessionsForSubject(targetId);

    await recordAuditLog({
      actor: session,
      action: 'admin.removed',
      targetType: 'admin',
      targetId,
      meta: { email: target.email, username: target.username },
    });

    return NextResponse.json({ message: 'Admin removed' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to remove admin', error: error.message }, { status: 500 });
  }
}
