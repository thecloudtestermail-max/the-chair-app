// src/app/api/auth/forgot/route.ts
//
// "Forgot password" for every account type. With an email provider
// configured it emails a one-hour reset link. Without one, it tells the
// person to email the platform's support address, who resets it for them.
// The response depends only on whether email is configured, never on whether
// the address has an account, so this can't be used to discover who has one.
import { NextResponse } from 'next/server';
import { createPasswordReset, resetUrl } from '@/lib/passwordReset';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { isValidEmail, normalizeEmail } from '@/lib/identity';
import { manualResetMessage, SUPPORT_EMAIL } from '@/lib/support';

export const dynamic = 'force-dynamic';

const manual = () => NextResponse.json({ delivery: 'manual', supportEmail: SUPPORT_EMAIL, message: manualResetMessage() });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const tenantSlug = typeof body?.tenantSlug === 'string' && body.tenantSlug ? body.tenantSlug : undefined;
    if (!isValidEmail(email)) return NextResponse.json({ message: 'Enter a valid email address' }, { status: 400 });

    const ip = clientIp(request);
    if (await isRateLimited('forgot', email, ip)) {
      return NextResponse.json({ message: 'Too many requests. Please wait a few minutes and try again.' }, { status: 429 });
    }
    await recordAttempt('forgot', email, ip);

    if (!isEmailConfigured()) return manual();

    const token = await createPasswordReset(email);
    if (token) {
      const url = resetUrl(token, tenantSlug);
      const sent = await sendEmail({
        to: email,
        subject: 'Reset your The Chair App password',
        html:
          `<p>Someone asked to reset the password for this email address on The Chair App.</p>` +
          `<p><a href="${url}">Choose a new password</a></p>` +
          `<p>This link works once and expires in 1 hour. If you didn't ask for it, you can ignore this email and your password will stay the same.</p>`,
        code: url,
      });
      // Delivery failed for a real account: don't leave them waiting.
      if (!sent) return manual();
    }

    return NextResponse.json({
      delivery: 'email',
      message: "If an account exists for that email, we've sent a link to reset your password. It's valid for 1 hour.",
    });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
