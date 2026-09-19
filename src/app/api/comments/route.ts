// src/app/api/comments/route.ts
//
// GET is public (no email/phone leak — same projection discipline as
// reviews/route.ts). POST is customer-only via verifyClaimSession. DELETE
// mixes both auth systems in one handler, same pattern as reviews/route.ts
// mixing requireRole (staff) and verifyClaimSession (customer) across
// different methods of one file: here a customer may delete their own
// comment, or staff may moderate any comment they own (admin: own tenant;
// barber: comments on their own posts).
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { verifyClaimSession } from '@/lib/customerAuth';
import { requireRole } from '@/lib/requireRole';
import { Comment, Post } from '@/lib/types';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 500;

export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('postId');
  if (!postId) return NextResponse.json({ message: 'postId required' }, { status: 400 });

  try {
    const db = await getDatabase();
    const comments = await db
      .collection<Comment>('comments')
      .aggregate([
        { $match: { postId: new ObjectId(postId) } },
        { $sort: { createdAt: -1 } },
        { $limit: 50 },
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
        { $addFields: { customerName: { $arrayElemAt: ['$customer.name', 0] } } },
        { $project: { customer: 0 } },
      ])
      .toArray();

    return NextResponse.json(comments);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch comments', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);
  if (!claim) return NextResponse.json({ message: 'Sign in to comment' }, { status: 401 });

  try {
    const { postId, text } = await req.json();
    if (!postId || !text || !text.trim()) {
      return NextResponse.json({ message: 'postId and text required' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ message: `Comment must be ${MAX_TEXT_LENGTH} characters or fewer` }, { status: 400 });
    }

    const db = await getDatabase();
    const post = await db.collection<Post>('posts').findOne({ _id: new ObjectId(postId) });
    if (!post) return NextResponse.json({ message: 'Post not found' }, { status: 404 });

    const comment: Comment = {
      postId: post._id!,
      tenantId: post.tenantId,
      customerId: claim.customerId,
      text: text.trim(),
      createdAt: new Date(),
    };

    const result = await db.collection<Comment>('comments').insertOne(comment);
    return NextResponse.json({ _id: result.insertedId, ...comment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to add comment', error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('_id');
  if (!id) return NextResponse.json({ message: 'Missing comment ID' }, { status: 400 });

  try {
    const db = await getDatabase();
    const comment = await db.collection<Comment>('comments').findOne({ _id: new ObjectId(id) });
    if (!comment) return NextResponse.json({ message: 'Comment not found' }, { status: 404 });

    const claim = await verifyClaimSession(req.cookies.get('customerClaim')?.value);
    if (claim && comment.customerId.equals(claim.customerId)) {
      await db.collection('comments').deleteOne({ _id: comment._id });
      return NextResponse.json({ message: 'Deleted' });
    }

    const session = await requireRole(req, ['admin', 'barber']);
    if (session) {
      const allowed = session.role === 'admin'
        ? comment.tenantId.equals(session.tenantId!)
        : session.barberId && await db.collection('posts').findOne({ _id: comment.postId, barberId: session.barberId });
      if (allowed) {
        await db.collection('comments').deleteOne({ _id: comment._id });
        return NextResponse.json({ message: 'Deleted' });
      }
    }

    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to delete comment', error: error.message }, { status: 500 });
  }
}
