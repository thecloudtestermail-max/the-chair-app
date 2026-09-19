// src/app/api/follows/route.ts
//
// Toggle following a stylist. Structurally identical to favorites/route.ts,
// just barberId instead of tenantId. GET is customer-only and used to
// hydrate a followingIds set client-side, mirroring the favoriteIds
// pattern in src/app/page.tsx.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { verifyClaimSession } from '@/lib/customerAuth';
import { Follow } from '@/lib/types';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);
  if (!claim) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });

  const db = await getDatabase();
  const follows = await db
    .collection<Follow>('follows')
    .aggregate([
      { $match: { customerId: claim.customerId } },
      { $lookup: { from: 'barbers', localField: 'barberId', foreignField: '_id', as: 'barber' } },
      { $unwind: '$barber' },
      { $lookup: { from: 'tenants', localField: 'barber.tenantId', foreignField: '_id', as: 'tenant' } },
      { $unwind: '$tenant' },
      {
        $project: {
          barberId: 1,
          name: '$barber.name',
          slug: '$barber.slug',
          imageUrl: '$barber.imageUrl',
          tenantSlug: '$tenant.slug',
        },
      },
    ])
    .toArray();

  return NextResponse.json(follows);
}

export async function POST(req: NextRequest) {
  const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);
  if (!claim) return NextResponse.json({ message: 'Sign in to follow stylists' }, { status: 401 });

  const { barberId } = await req.json();
  if (!barberId) return NextResponse.json({ message: 'barberId required' }, { status: 400 });

  const db = await getDatabase();
  await db.collection<Follow>('follows').updateOne(
    { customerId: claim.customerId, barberId: new ObjectId(barberId) },
    { $setOnInsert: { customerId: claim.customerId, barberId: new ObjectId(barberId), createdAt: new Date() } },
    { upsert: true }
  );
  return NextResponse.json({ message: 'Followed' }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);
  if (!claim) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });

  const barberId = req.nextUrl.searchParams.get('barberId');
  if (!barberId) return NextResponse.json({ message: 'barberId required' }, { status: 400 });

  const db = await getDatabase();
  await db.collection('follows').deleteOne({ customerId: claim.customerId, barberId: new ObjectId(barberId) });
  return NextResponse.json({ message: 'Unfollowed' });
}
