// src/app/api/auth/login/route.ts
//
// `tenantSlug` is now optional: super_admin accounts have no tenant at all,
// so they authenticate by email+password alone against users with no
// tenantId. Tenant-scoped staff (admin/receptionist/barber) still must
// supply the tenantSlug they're logging into.
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { verifyPassword, createSession, recordLoginAttempt } from '@/lib/auth';
import { User } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const { email, password, tenantSlug } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email and password required' },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    // Rate limiting: check login attempts
    const attempts = await recordLoginAttempt(email);
    if (attempts > 5) {
      return NextResponse.json(
        { message: 'Too many login attempts. Try again later.' },
        { status: 429 }
      );
    }

    let user: User | null;
    let tenantId: import('mongodb').ObjectId | undefined;

    if (tenantSlug) {
      // Tenant-scoped staff login.
      const tenant = await db.collection('tenants').findOne({ slug: tenantSlug });
      if (!tenant || tenant.status !== 'active') {
        return NextResponse.json(
          { message: 'Invalid tenant or tenant suspended' },
          { status: 401 }
        );
      }
      user = await db.collection<User>('users').findOne({ tenantId: tenant._id, email });
      tenantId = tenant._id;
    } else {
      // Platform super_admin login — no tenant scope.
      user = await db.collection<User>('users').findOne({ email, role: 'super_admin' });
      tenantId = undefined;
    }

    // Audit fix: always run a bcrypt comparison, even when no user was
    // found, so the response time doesn't leak whether the email exists.
    // The dummy hash is a real bcrypt hash of a value nobody can supply
    // (never matches), just to make the "no user" path pay the same
    // compute cost as the "wrong password" path.
    const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8lfXcnAmxbjHDlxpqZR8P1XHqxhqLm';
    const isValid = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);

    if (!user || !isValid) {
      return NextResponse.json(
        { message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const { rawToken, expiresAt } = await createSession(
      user._id!,
      'user',
      user.role,
      tenantId,
      user.role === 'barber' ? user.barberId : undefined
    );

    const response = NextResponse.json(
      {
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
        message: 'Login successful',
      },
      { status: 200 }
    );

    response.cookies.set('session', rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: 'Login failed', error: error.message },
      { status: 500 }
    );
  }
}
