// src/app/api/staff/accept/route.ts
//
// Public (unauthenticated) endpoint a newly-invited staff member hits to
// set their own password and activate the account — see the "Have a setup
// code?" flow on the tenant staff login page. Reuses the same login
// rate-limiter as api/auth/login (keyed by email) since this is just as
// much a credential-guessing surface as a password field is.
import { NextResponse } from 'next/server';
import { acceptStaffInvite } from '@/lib/staffAuth';
import { createSession, recordLoginAttempt } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, code, password } = await request.json();

    if (!email || !code || !password) {
      return NextResponse.json({ message: 'Email, code, and password are required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ message: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const attempts = await recordLoginAttempt(email);
    if (attempts > 5) {
      return NextResponse.json({ message: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const result = await acceptStaffInvite(email, code.trim().toUpperCase(), password);
    if (!result) {
      return NextResponse.json({ message: 'Invalid or expired code' }, { status: 401 });
    }

    const { user } = result;
    const { rawToken, expiresAt } = await createSession(
      user._id,
      'user',
      user.role,
      user.tenantId,
      user.role === 'barber' ? user.barberId : undefined
    );

    const response = NextResponse.json({
      message: 'Account activated',
      user: { _id: user._id, email: user.email, username: user.username, role: user.role },
    });

    response.cookies.set('session', rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to activate account', error: error.message }, { status: 500 });
  }
}
