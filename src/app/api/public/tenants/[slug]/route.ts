// src/app/api/public/tenants/[slug]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { verifyClaimSession } from '@/lib/customerAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const db = await getDatabase();

    // Fetch tenant
    const tenant = await db
      .collection('tenants')
      .findOne({ slug, status: 'active' }, { projection: { _id: 1, name: 1, slug: 1, branding: 1, contactEmail: 1, currency: 1 } });

    if (!tenant) {
      return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });
    }

    // Fetch site settings
    const settings = await db
      .collection('siteSettings')
      .findOne({ tenantId: tenant._id }, { projection: { passwordHash: 0 } });

    // Fetch barbers, enriched with follower state (Part 3 — social feed).
    // isFollowedByMe is only ever computed when a valid customerClaim
    // cookie is present; this route stays fully public otherwise.
    const barbersRaw = await db
      .collection('barbers')
      .find({ tenantId: tenant._id }, { projection: { tenantId: 0 } })
      .toArray();
    const barberIds = barbersRaw.map((b) => b._id);
    const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);
    const [followerCounts, myFollows] = await Promise.all([
      db.collection('follows').aggregate([{ $match: { barberId: { $in: barberIds } } }, { $group: { _id: '$barberId', count: { $sum: 1 } } }]).toArray(),
      claim ? db.collection('follows').find({ customerId: claim.customerId, barberId: { $in: barberIds } }).toArray() : Promise.resolve([]),
    ]);
    const followerCountByBarber = new Map(followerCounts.map((f) => [f._id.toString(), f.count]));
    const followedBarberIds = new Set(myFollows.map((f) => f.barberId.toString()));
    const barbers = barbersRaw.map((b) => ({
      ...b,
      followerCount: followerCountByBarber.get(b._id.toString()) || 0,
      isFollowedByMe: followedBarberIds.has(b._id.toString()),
    }));

    // Fetch services
    const services = await db
      .collection('services')
      .find({ tenantId: tenant._id }, { projection: { tenantId: 0, passwordHash: 0 } })
      .toArray();

    // Fetch categories
    const categories = await db
      .collection('categories')
      .find({ tenantId: tenant._id }, { projection: { tenantId: 0 } })
      .toArray();

    // Fetch visible reviews (new in Part 2) — only ever those tied to a
    // real completed appointment (see POST /api/reviews), so this is
    // customer feedback that actually happened, not free-floating ratings.
    const reviews = await db
      .collection('reviews')
      .find({ tenantId: tenant._id, status: 'visible' }, { projection: { customerId: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    const averageRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

    return NextResponse.json({
      tenant,
      settings,
      barbers,
      services,
      categories,
      reviews,
      averageRating,
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch tenant details', error: error.message }, { status: 500 });
  }
}
