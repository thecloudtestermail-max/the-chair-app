// src/app/api/staff/accept/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { createSession, verifyPassword, hashPassword } from '@/lib/auth';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const { email, tempPassword, newPassword, newPasswordConfirm, tenantSlug } = await req.json();

    if (!email || !tempPassword || !newPassword || !tenantSlug) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (newPassword !== newPasswordConfirm) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }

    // Rate limit on email using 'reset' scope (similar operation)
    if (await isRateLimited('reset', email, ip)) {
      await recordAttempt('reset', email, ip);
      return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes.' }, { status: 429 });
    }

    const db = await getDatabase();

    // Find the tenant
    const tenant = await db.collection('tenants').findOne({ slug: tenantSlug });
    if (!tenant) {
      await recordAttempt('reset', email, ip);
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Find user and verify temp password hasn't expired
    const user = await db.collection('users').findOne({
      email: email.toLowerCase(),
      tenantId: tenant._id,
    });

    if (!user) {
      await recordAttempt('reset', email, ip);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.tempPasswordExpiresAt || new Date() > new Date(user.tempPasswordExpiresAt)) {
      await recordAttempt('reset', email, ip);
      return NextResponse.json({ error: 'Temporary password expired' }, { status: 401 });
    }

    // Verify temp password
    const tempPasswordValid = await verifyPassword(tempPassword, user.passwordHash);
    if (!tempPasswordValid) {
      await recordAttempt('reset', email, ip);
      return NextResponse.json({ error: 'Invalid temporary password' }, { status: 401 });
    }

    // Hash the new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and clear temp password
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          lastLoginAt: new Date(),
        },
        $unset: {
          tempPasswordExpiresAt: 1,
        },
      }
    );

    // Create session
    const { rawToken, expiresAt } = await createSession(
      user._id,
      'user',
      user.role,
      tenant._id,
      user.barberId
    );

    return NextResponse.json({
      success: true,
      token: rawToken,
      expiresAt,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('staff accept error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
