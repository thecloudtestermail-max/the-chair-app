// src/app/api/admin/login/route.ts
//
// The platform super_admin's own door. Kept separate from /api/auth/login so
// that door can never be used to reach a super_admin account, and so this one
// can be tightened independently (MFA, IP allow-list) later.
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { verifyPassword, createSession, DUMMY_HASH } from '@/lib/auth';
import { setStaffCookie } from '@/lib/authCookies';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { normalizeEmail } from '@/lib/identity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) return NextResponse.json({ message: 'Email and password required' }, { status: 400 });

    const ip = clientIp(request);
    if (await isRateLimited('admin', email, ip)) {
      return NextResponse.json({ message: 'Too many sign-in attempts. Please wait a few minutes and try again.' }, { status: 429 });
    }

    const db = await getDatabase();
    const user = (await db.collection('users').findOne({ email, role: 'super_admin' })) as any;
    const ok = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) {
      await recordAttempt('admin', email, ip);
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    const { rawToken, expiresAt } = await createSession(user._id, 'user', 'super_admin');
    const response = NextResponse.json({ message: 'Signed in', user: { _id: user._id, email: user.email, username: user.username, role: user.role } });
    setStaffCookie(response, rawToken, expiresAt);
    return response;
  } catch (error: any) {
    console.error('Admin login error:', error);
    return NextResponse.json({ message: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
}
