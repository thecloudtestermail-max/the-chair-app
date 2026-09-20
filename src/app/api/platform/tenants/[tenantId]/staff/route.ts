// src/app/api/platform/tenants/[tenantId]/staff/route.ts
//
// Staff roster for one tenant's detail page. Read-only here — reissuing a
// password or removing access is done from the cross-tenant staff surface
// (/admin/staff, api/platform/staff) so there's one implementation of that
// logic instead of two.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { tenantId } = await params;
    if (!ObjectId.isValid(tenantId)) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });

    const db = await getDatabase();
    const staff = await db
      .collection('users')
      .find(
        { tenantId: new ObjectId(tenantId) },
        { projection: { passwordHash: 0 } }
      )
      .sort({ role: 1, username: 1 })
      .toArray();

    return NextResponse.json(staff);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to load staff', error: error.message }, { status: 500 });
  }
}
