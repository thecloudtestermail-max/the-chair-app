// src/app/api/platform/moderation/reviews/route.ts
//
// Cross-tenant review moderation queue. Reviews already carry a
// status ('visible' | 'flagged') that each tenant's own admin can set
// (api/reviews/route.ts) — this is the platform-wide view over the same
// field, for the case a tenant admin flags something but wants platform
// oversight, or a review needs removing regardless of whether the tenant
// admin acts on it.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { recordAuditLog } from '@/lib/auditLog';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const status = req.nextUrl.searchParams.get('status') || 'flagged';
    const db = await getDatabase();

    const match: Record<string, unknown> = status === 'all' ? {} : { status };

    const reviews = await db
      .collection('reviews')
      .aggregate([
        { $match: match },
        { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } },
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
        { $lookup: { from: 'barbers', localField: 'barberId', foreignField: '_id', as: 'barber' } },
        {
          $addFields: {
            tenantName: { $arrayElemAt: ['$tenant.name', 0] },
            tenantSlug: { $arrayElemAt: ['$tenant.slug', 0] },
            customerName: { $arrayElemAt: ['$customer.name', 0] },
            barberName: { $arrayElemAt: ['$barber.name', 0] },
          },
        },
        { $project: { tenant: 0, customer: 0, barber: 0 } },
        { $sort: { createdAt: -1 } },
        { $limit: 200 },
      ])
      .toArray();

    return NextResponse.json(reviews);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to load reviews', error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { id, status } = await req.json();
    if (!id || !ObjectId.isValid(id)) return NextResponse.json({ message: 'Invalid review ID' }, { status: 400 });
    if (status !== 'visible' && status !== 'flagged') return NextResponse.json({ message: 'Invalid status' }, { status: 400 });

    const db = await getDatabase();
    const review = await db.collection('reviews').findOne({ _id: new ObjectId(id) });
    if (!review) return NextResponse.json({ message: 'Review not found' }, { status: 404 });

    await db.collection('reviews').updateOne({ _id: review._id }, { $set: { status } });

    await recordAuditLog({
      actor: session,
      action: status === 'visible' ? 'review.approved' : 'review.flagged',
      targetType: 'review',
      targetId: review._id,
      meta: { tenantId: review.tenantId?.toString() },
    });

    return NextResponse.json({ message: 'Review updated' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to update review', error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !ObjectId.isValid(id)) return NextResponse.json({ message: 'Invalid review ID' }, { status: 400 });

    const db = await getDatabase();
    const review = await db.collection('reviews').findOne({ _id: new ObjectId(id) });
    if (!review) return NextResponse.json({ message: 'Review not found' }, { status: 404 });

    await db.collection('reviews').deleteOne({ _id: review._id });

    await recordAuditLog({
      actor: session,
      action: 'review.deleted',
      targetType: 'review',
      targetId: review._id,
      meta: { tenantId: review.tenantId?.toString(), rating: review.rating },
    });

    return NextResponse.json({ message: 'Review deleted' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to delete review', error: error.message }, { status: 500 });
  }
}
