// src/app/api/customer-auth/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { sendEmail } from '@/lib/email';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const { email } = await req.json();
    
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    if (await isRateLimited('forgot', normalizedEmail, ip)) {
      await recordAttempt('forgot', normalizedEmail, ip);
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const db = await getDatabase();
    const customer = await db.collection('customers').findOne({ email: normalizedEmail });
    
    if (!customer) {
      // Don't reveal whether email exists
      await recordAttempt('forgot', normalizedEmail, ip);
      return NextResponse.json({ success: true, email });
    }

    // Generate claim code
    const claimCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60_000); // 15 minutes

    await db.collection('customerClaimCodes').updateOne(
      { customerId: customer._id },
      {
        $set: {
          customerId: customer._id,
          code: claimCode,
          expiresAt,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    const sent = await sendEmail({
      to: customer.email,
      subject: 'Your Chair App Verification Code',
      html: `<p>Your verification code is: <strong>${claimCode}</strong></p><p>This code expires in 15 minutes.</p>`,
    });

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    await recordAttempt('forgot', normalizedEmail, ip);
    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error('customer-auth request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
