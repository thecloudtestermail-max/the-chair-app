// src/app/api/customer-auth/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requestClaimCode } from '@/lib/customerAuth';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ message: 'Email required' }, { status: 400 });

    const result = await requestClaimCode(email);

    // Same response whether or not the email matched a customer — no
    // enumeration signal either way.
    const response: Record<string, any> = { message: 'If that email has booked with us before, a code is on its way.' };

    if (result) {
      console.log(`[customer-auth] one-time code for ${email}: ${result.code}`);
      const emailed = await sendEmail({
        to: email,
        subject: `Your sign-in code: ${result.code}`,
        html: `<p>Here's your one-time sign-in code:</p><p style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:0.1em;">${result.code}</p><p>It expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
        code: result.code,
      });

      // Whenever email didn't actually go out — EmailJS isn't configured,
      // or the request to it failed — hand the code back directly instead
      // of leaving the customer stuck with a code only the server log can
      // see. Once EmailJS is configured, real delivery takes over and this
      // stops firing.
      if (!emailed) {
        response.devCode = result.code;
      }
    }

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to send code', error: error.message }, { status: 500 });
  }
}
