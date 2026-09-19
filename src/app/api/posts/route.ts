// src/app/api/posts/route.ts
//
// Part 3 — stylist social feed. Public GET (global feed, or scoped to one
// barber for their profile page), staff-authenticated create/delete.
//
// Ownership is always resolved server-side from the session, never trusted
// from the client: a barber-role session can only post/delete as
// session.barberId (mirrors requireRole.ts's tenant-scoping comment), and
// an admin-role session may only act on barbers that belong to their own
// tenantId (same ownership-check shape as appointments/route.ts POST).
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { verifyClaimSession } from '@/lib/customerAuth';
import { Post } from '@/lib/types';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

const MAX_CAPTION_LENGTH = 2000;
const DEFAULT_LIMIT = 20;

export async function GET(req: NextRequest) {
  try {
    const barberIdParam = req.nextUrl.searchParams.get('barberId');
    const mine = req.nextUrl.searchParams.get('mine') === 'true';
    const before = req.nextUrl.searchParams.get('before');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || String(DEFAULT_LIMIT)) || DEFAULT_LIMIT, 50);

    const db = await getDatabase();

    const match: Record<string, any> = {};
    if (mine) {
      const session = await requireRole(req, ['admin', 'barber']);
      if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      if (session.role === 'barber') {
        if (!session.barberId) return NextResponse.json({ message: 'Session has no linked barber — please log in again' }, { status: 400 });
        match.barberId = session.barberId;
      } else {
        match.tenantId = session.tenantId;
      }
    } else if (barberIdParam) {
      match.barberId = new ObjectId(barberIdParam);
    }
    if (before) match.createdAt = { $lt: new Date(before) };

    // Optional auth — a valid customerClaim cookie only adds `isLikedByMe`
    // to each post; the feed itself stays public whether signed in or not.
    const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);

    const posts = await db
      .collection<Post>('posts')
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        { $lookup: { from: 'barbers', localField: 'barberId', foreignField: '_id', as: 'barber' } },
        { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } },
        { $lookup: { from: 'likes', localField: '_id', foreignField: 'postId', as: 'likes' } },
        { $lookup: { from: 'comments', localField: '_id', foreignField: 'postId', as: 'comments' } },
        {
          $addFields: {
            barberName: { $arrayElemAt: ['$barber.name', 0] },
            barberSlug: { $arrayElemAt: ['$barber.slug', 0] },
            barberImageUrl: { $arrayElemAt: ['$barber.imageUrl', 0] },
            tenantName: { $arrayElemAt: ['$tenant.name', 0] },
            tenantSlug: { $arrayElemAt: ['$tenant.slug', 0] },
            likeCount: { $size: '$likes' },
            commentCount: { $size: '$comments' },
            isLikedByMe: claim
              ? { $in: [claim.customerId, '$likes.customerId'] }
              : false,
          },
        },
        { $project: { barber: 0, tenant: 0, likes: 0, comments: 0 } },
      ])
      .toArray();

    return NextResponse.json(posts);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch posts', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'barber']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { imageUrl, caption } = body;

    if (!imageUrl) return NextResponse.json({ message: 'imageUrl required' }, { status: 400 });
    if (caption && caption.length > MAX_CAPTION_LENGTH) {
      return NextResponse.json({ message: `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer` }, { status: 400 });
    }

    const db = await getDatabase();

    let barberId: ObjectId;
    if (session.role === 'barber') {
      if (!session.barberId) return NextResponse.json({ message: 'Session has no linked barber — please log in again' }, { status: 400 });
      barberId = session.barberId;
    } else {
      const requestedBarberId = body.barberId;
      if (!requestedBarberId) return NextResponse.json({ message: 'barberId required' }, { status: 400 });
      const barber = await db.collection('barbers').findOne({ _id: new ObjectId(requestedBarberId), tenantId: session.tenantId });
      if (!barber) return NextResponse.json({ message: 'Barber not found for this tenant' }, { status: 404 });
      barberId = barber._id;
    }

    const post: Post = {
      tenantId: session.tenantId,
      barberId,
      imageUrl,
      caption: caption || undefined,
      createdAt: new Date(),
    };

    const result = await db.collection<Post>('posts').insertOne(post);
    return NextResponse.json({ _id: result.insertedId, ...post }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to create post', error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'barber']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('_id');
  if (!id) return NextResponse.json({ message: 'Missing post ID' }, { status: 400 });

  try {
    const db = await getDatabase();
    const post = await db.collection<Post>('posts').findOne({ _id: new ObjectId(id) });
    if (!post) return NextResponse.json({ message: 'Post not found' }, { status: 404 });

    const owns = session.role === 'barber'
      ? session.barberId && post.barberId.equals(session.barberId)
      : post.tenantId.equals(session.tenantId);
    if (!owns) return NextResponse.json({ message: 'Post not found' }, { status: 404 });

    await Promise.all([
      db.collection('posts').deleteOne({ _id: post._id }),
      db.collection('likes').deleteMany({ postId: post._id }),
      db.collection('comments').deleteMany({ postId: post._id }),
    ]);

    return NextResponse.json({ message: 'Deleted' });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to delete post', error: error.message }, { status: 500 });
  }
}
