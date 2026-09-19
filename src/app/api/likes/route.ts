// src/app/api/likes/route.ts
//
// Toggle a like on a post. Structurally identical to favorites/route.ts.
// No GET here — unlike favorites (which needs to hydrate heart-state across
// a separately-fetched tenant list), `isLikedByMe` is embedded directly in
// GET /api/posts, so there's no separate "list my likes" client need.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { verifyClaimSession } from '@/lib/customerAuth';
import { Like } from '@/lib/types';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);
  if (!claim) return NextResponse.json({ message: 'Sign in to like posts' }, { status: 401 });

  const { postId } = await req.json();
  if (!postId) return NextResponse.json({ message: 'postId required' }, { status: 400 });

  const db = await getDatabase();
  await db.collection<Like>('likes').updateOne(
    { customerId: claim.customerId, postId: new ObjectId(postId) },
    { $setOnInsert: { customerId: claim.customerId, postId: new ObjectId(postId), createdAt: new Date() } },
    { upsert: true }
  );
  return NextResponse.json({ message: 'Liked' }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);
  if (!claim) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });

  const postId = req.nextUrl.searchParams.get('postId');
  if (!postId) return NextResponse.json({ message: 'postId required' }, { status: 400 });

  const db = await getDatabase();
  await db.collection('likes').deleteOne({ customerId: claim.customerId, postId: new ObjectId(postId) });
  return NextResponse.json({ message: 'Unliked' });
}
