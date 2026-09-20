// src/app/api/platform/staff/route.ts
//
// Cross-tenant staff directory: search by name/email across every salon at
// once, with the tenant each result belongs to joined in. This is the
// support surface for "I'm locked out and don't remember which salon" or
// simply finding someone fast without knowing their tenant first.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim();
    const db = await getDatabase();

    const baseMatch: Record<string, unknown> = { role: { $ne: 'super_admin' } };
    const pipeline: Record<string, unknown>[] = [
      { $match: baseMatch },
      { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } },
      { $addFields: { tenantName: { $arrayElemAt: ['$tenant.name', 0] }, tenantSlug: { $arrayElemAt: ['$tenant.slug', 0] } } },
    ];

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      pipeline.push({ $match: { $or: [{ username: re }, { email: re }, { tenantName: re }, { tenantSlug: re }] } });
    }

    pipeline.push({ $project: { passwordHash: 0, tenant: 0 } }, { $sort: { username: 1 } }, { $limit: 100 });

    const results = await db.collection('users').aggregate(pipeline).toArray();

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to search staff', error: error.message }, { status: 500 });
  }
}
