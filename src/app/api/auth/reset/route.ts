// src/app/api/auth/reset/route.ts
import { NextResponse } from 'next/server';
import { consumePasswordReset } from '@/lib/passwordReset';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!token || !password) return NextResponse.json({ message: 'Reset link and new password are required' }, { status: 400 });

    const ip = clientIp(request);
    if (await isRateLimited('reset', 'link', ip)) {
      return NextResponse.json({ message: 'Too many attempts. Please wait a few minutes and try again.' }, { status: 429 });
    }
    await recordAttempt('reset', 'link', ip);

    const result = await consumePasswordReset(token, password);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });

    return NextResponse.json({ message: 'Your password has been updated. You can sign in now.' });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return NextResponse.json({ message: 'Could not reset your password. Please try again.' }, { status: 500 });
  }
}
