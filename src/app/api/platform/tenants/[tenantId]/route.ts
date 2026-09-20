// src/app/api/platform/tenants/[tenantId]/route.ts
//
// Single-tenant admin surface: GET returns the tenant plus a stats snapshot
// for the detail page, PATCH edits profile fields or flips status
// (active/suspended), DELETE permanently removes a tenant and everything
// scoped to it.
//
// DELETE is deliberately guarded twice: the tenant must already be
// suspended (a live salon can't be deleted in one step), and the caller
// must echo the tenant's own slug back as confirmation — the same
// "type the name to confirm" pattern as most platforms' danger zones,
// since this cascades across ten collections with no undo.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { recordAuditLog } from '@/lib/auditLog';
import { Tenant } from '@/lib/types';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

async function loadTenant(tenantId: string) {
  if (!ObjectId.isValid(tenantId)) return null;
  const db = await getDatabase();
  return db.collection<Tenant>('tenants').findOne({ _id: new ObjectId(tenantId) });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { tenantId } = await params;
    const tenant = await loadTenant(tenantId);
    if (!tenant) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });

    const db = await getDatabase();
    const id = tenant._id!;

    const [staffCount, appointmentCount, appointment30dCount, barberCount, serviceCount, reviewAgg] = await Promise.all([
      db.collection('users').countDocuments({ tenantId: id }),
      db.collection('appointments').countDocuments({ tenantId: id }),
      db.collection('appointments').countDocuments({ tenantId: id, dateTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) } }),
      db.collection('barbers').countDocuments({ tenantId: id }),
      db.collection('services').countDocuments({ tenantId: id }),
      db
        .collection('reviews')
        .aggregate([{ $match: { tenantId: id, status: 'visible' } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }])
        .toArray(),
    ]);

    return NextResponse.json({
      tenant,
      stats: {
        staffCount,
        appointmentCount,
        appointment30dCount,
        barberCount,
        serviceCount,
        reviewCount: reviewAgg[0]?.count || 0,
        avgRating: reviewAgg[0]?.avg ? Math.round(reviewAgg[0].avg * 10) / 10 : null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to load tenant', error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { tenantId } = await params;
    const tenant = await loadTenant(tenantId);
    if (!tenant) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });

    const body = await req.json();
    const update: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};

    if (typeof body.name === 'string' && body.name.trim() && body.name !== tenant.name) {
      update.name = body.name.trim();
      meta.name = { from: tenant.name, to: update.name };
    }
    if (typeof body.contactEmail === 'string' && body.contactEmail.trim() && body.contactEmail !== tenant.contactEmail) {
      update.contactEmail = body.contactEmail.trim();
      meta.contactEmail = { from: tenant.contactEmail, to: update.contactEmail };
    }
    if (typeof body.primaryColor === 'string' && body.primaryColor !== tenant.branding?.primaryColor) {
      update['branding.primaryColor'] = body.primaryColor;
      meta.primaryColor = { from: tenant.branding?.primaryColor, to: body.primaryColor };
    }
    if ((body.status === 'active' || body.status === 'suspended') && body.status !== tenant.status) {
      update.status = body.status;
      meta.status = { from: tenant.status, to: body.status };
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ message: 'No changes to apply' }, { status: 400 });
    }

    const db = await getDatabase();
    await db.collection('tenants').updateOne({ _id: tenant._id }, { $set: update });

    await recordAuditLog({
      actor: session,
      action: update.status ? `tenant.${update.status === 'suspended' ? 'suspended' : 'reactivated'}` : 'tenant.edited',
      targetType: 'tenant',
      targetId: tenant._id,
      meta: { tenantName: tenant.name, tenantSlug: tenant.slug, ...meta },
    });

    const updated = await db.collection<Tenant>('tenants').findOne({ _id: tenant._id });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to update tenant', error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { tenantId } = await params;
    const tenant = await loadTenant(tenantId);
    if (!tenant) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });

    if (tenant.status !== 'suspended') {
      return NextResponse.json({ message: 'Suspend the tenant before deleting it' }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.confirmSlug !== tenant.slug) {
      return NextResponse.json({ message: 'Slug confirmation does not match' }, { status: 400 });
    }

    const db = await getDatabase();
    const id = tenant._id!;

    // Likes have no tenantId of their own (only postId + customerId), so
    // the posts they point at must be captured before those posts are
    // deleted below, or they'd be orphaned instead of cleaned up.
    const tenantPostIds = await db.collection('posts').find({ tenantId: id }, { projection: { _id: 1 } }).map((p) => p._id).toArray();

    // Cascade across every tenant-scoped collection. Customers are NOT
    // tenant-owned (one account can hold appointments at several salons),
    // so instead of deleting them we only strip this tenant's key out of
    // their per-tenant loyaltyPoints map.
    await Promise.all([
      db.collection('barbers').deleteMany({ tenantId: id }),
      db.collection('services').deleteMany({ tenantId: id }),
      db.collection('categories').deleteMany({ tenantId: id }),
      db.collection('appointments').deleteMany({ tenantId: id }),
      db.collection('reviews').deleteMany({ tenantId: id }),
      db.collection('favorites').deleteMany({ tenantId: id }),
      db.collection('posts').deleteMany({ tenantId: id }),
      db.collection('comments').deleteMany({ tenantId: id }),
      db.collection('likes').deleteMany({ postId: { $in: tenantPostIds } }),
      db.collection('siteSettings').deleteMany({ tenantId: id }),
      db.collection('users').deleteMany({ tenantId: id }),
      db.collection('customers').updateMany({ [`loyaltyPoints.${id.toString()}`]: { $exists: true } }, { $unset: { [`loyaltyPoints.${id.toString()}`]: '' } }),
    ]);

    // Follows point at barberIds, which are now gone with the barbers
    // deleteMany above — clean up any that reference a barber that no
    // longer exists (cheap re-check rather than tracking ids through the
    // Promise.all above).
    const remainingBarberIds = await db.collection('barbers').distinct('_id');
    await db.collection('follows').deleteMany({ barberId: { $nin: remainingBarberIds } });

    await db.collection('tenants').deleteOne({ _id: id });

    await recordAuditLog({
      actor: session,
      action: 'tenant.deleted',
      targetType: 'tenant',
      targetId: id,
      meta: { tenantName: tenant.name, tenantSlug: tenant.slug },
    });

    return NextResponse.json({ message: 'Tenant deleted' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to delete tenant', error: error.message }, { status: 500 });
  }
}
