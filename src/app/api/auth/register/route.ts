// src/app/api/auth/register/route.ts
//
// Customer sign-up with full details, so a customer can use everything the
// app offers (bookings history, loyalty, favourites, following stylists,
// likes and comments). Staff are never created here: salon admins add them.
//
// If the email already has a customer record (for example from an earlier
// guest booking) we do NOT let a stranger claim it by typing that email:
// they are pointed at "Forgot password", which proves control of the inbox.
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { hashPassword } from '@/lib/auth';
import { createCustomerSession } from '@/lib/customerAuth';
import { setCustomerCookie } from '@/lib/authCookies';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { isValidEmail, isValidPhone, normalizeEmail } from '@/lib/identity';
import { validatePassword } from '@/lib/password';
import type { Customer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = normalizeEmail(body?.email);
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const tenantSlug = typeof body?.tenantSlug === 'string' && body.tenantSlug ? body.tenantSlug : undefined;

    if (name.length < 2 || name.length > 80) return NextResponse.json({ message: 'Enter your full name' }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ message: 'Enter a valid email address' }, { status: 400 });
    if (!isValidPhone(phone)) return NextResponse.json({ message: 'Enter a valid phone number' }, { status: 400 });
    const problem = validatePassword(password, email);
    if (problem) return NextResponse.json({ message: problem }, { status: 400 });

    const ip = clientIp(request);
    if (await isRateLimited('register', email, ip)) {
      return NextResponse.json({ message: 'Too many attempts. Please wait a few minutes and try again.' }, { status: 429 });
    }
    await recordAttempt('register', email, ip);

    const db = await getDatabase();
    const exists = { message: 'An account with this email already exists. Sign in, or use "Forgot password" to set a password.', code: 'exists' };
    if (await db.collection('customers').findOne({ email }, { projection: { _id: 1 } })) {
      return NextResponse.json(exists, { status: 409 });
    }

    const customer: Customer = {
      name,
      email,
      phone,
      passwordHash: await hashPassword(password),
      loyaltyPoints: {},
      createdAt: new Date(),
    };
    let insertedId;
    try {
      insertedId = (await db.collection<Customer>('customers').insertOne(customer)).insertedId;
    } catch (err: any) {
      if (err?.code === 11000) return NextResponse.json(exists, { status: 409 }); // lost a race on the unique email index
      throw err;
    }

    const { rawToken } = await createCustomerSession(insertedId);
    const response = NextResponse.json(
      { message: 'Account created', customer: { name, email }, redirect: tenantSlug ? `/t/${tenantSlug}` : '/' },
      { status: 201 }
    );
    setCustomerCookie(response, rawToken);
    return response;
  } catch (error: any) {
    console.error('Register error:', error);
    return NextResponse.json({ message: 'Could not create your account. Please try again.' }, { status: 500 });
  }
}
