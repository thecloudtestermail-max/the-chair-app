// src/app/api/customer-auth/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { createCustomerSession } from '@/lib/customerAuth';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const { email, code } = await req.json();
    
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    if (await isRateLimited('forgot', normalizedEmail, ip)) {
      await recordAttempt('forgot', normalizedEmail, ip);
      return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
    }

    const db = await getDatabase();
    const customer = await db.collection('customers').findOne({ email: normalizedEmail });
    
    if (!customer) {
      await recordAttempt('forgot', normalizedEmail, ip);
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Verify claim code
    const claimRecord = await db.collection('customerClaimCodes').findOne({
      customerId: customer._id,
      code: code.toUpperCase(),
      expiresAt: { $gt: new Date() },
    });

    if (!claimRecord) {
      await recordAttempt('forgot', normalizedEmail, ip);
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 });
    }

    // Create session
    const { rawToken, expiresAt } = await createCustomerSession(customer._id);

    // Clean up claim code
    await db.collection('customerClaimCodes').deleteOne({ customerId: customer._id });

    return NextResponse.json({
      success: true,
      token: rawToken,
      expiresAt,
    });
  } catch (error) {
    console.error('customer-auth verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
