// src/app/api/customer-auth/me/route.ts
import { NextResponse } from 'next/server';
import { verifyClaimSession } from '@/lib/customerAuth';
import { getDatabase } from '@/lib/mongodb';
import { readCookie, CUSTOMER_COOKIE } from '@/lib/authCookies';
import { isValidPhone } from '@/lib/identity';

export const dynamic = 'force-dynamic';

async function currentCustomer(req: Request) {
  const claim = await verifyClaimSession(readCookie(req, CUSTOMER_COOKIE));
  if (!claim) return null;
  const db = await getDatabase();
  const customer = (await db.collection('customers').findOne({ _id: claim.customerId }, { projection: { name: 1, email: 1, phone: 1 } })) as any;
  // The id comes from the session itself, not from the projected document.
  return customer ? { db, customer, customerId: claim.customerId } : null;
}

export async function GET(req: Request) {
  const found = await currentCustomer(req);
  if (!found) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });
  const { customer, customerId } = found;
  return NextResponse.json({ customerId, name: customer.name, email: customer.email, phone: customer.phone ?? '' });
}

/** Edit your own name and phone. Email is your identity and can't be changed here. */
export async function PATCH(req: Request) {
  const found = await currentCustomer(req);
  if (!found) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, string> = {};
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 80) return NextResponse.json({ message: 'Enter your full name' }, { status: 400 });
    updates.name = name;
  }
  if ('phone' in body) {
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!isValidPhone(phone)) return NextResponse.json({ message: 'Enter a valid phone number' }, { status: 400 });
    updates.phone = phone;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ message: 'Nothing to update' }, { status: 400 });

  await found.db.collection('customers').updateOne({ _id: found.customerId }, { $set: updates });
  return NextResponse.json({ customerId: found.customerId, name: updates.name ?? found.customer.name, email: found.customer.email, phone: updates.phone ?? found.customer.phone ?? '' });
}
