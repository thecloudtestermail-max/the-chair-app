// src/app/api/customers/route.ts
//
// Customers are a cross-tenant collection (one person, phone/email, may visit
// multiple salons), so there's no `tenantId` field on the document itself.
// Isolation instead comes from `loyaltyPoints`, which is keyed by tenantId:
// a tenant's staff can only see/manage customers who have a loyalty entry
// for THAT tenant — not the entire cross-tenant customer directory.
import { normalizeEmail } from '@/lib/identity';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { Customer } from '@/lib/types';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

const ALLOWED_UPDATE_FIELDS = ['name', 'phone']; // never email (identity) or passwordHash/loyaltyPoints here

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDatabase();
    const customers = await db
      .collection<Customer>('customers')
      .find({ [`loyaltyPoints.${session.tenantId.toString()}`]: { $exists: true } })
      .project({ passwordHash: 0 })
      .toArray();

    return NextResponse.json(customers);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch customers', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, phone } = body;
    const email = normalizeEmail(body.email);

    if (!name || !email || !phone) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const db = await getDatabase();

    // Customers are unique per email (see init-db.ts unique index) — find-or-attach
    // to this tenant rather than blindly inserting a duplicate.
    const existing = await db.collection<Customer>('customers').findOne({ email });
    if (existing) {
      const result = await db.collection<Customer>('customers').findOneAndUpdate(
        { _id: existing._id },
        { $set: { [`loyaltyPoints.${session.tenantId.toString()}`]: existing.loyaltyPoints?.[session.tenantId.toString()] ?? 0 } },
        { returnDocument: 'after', projection: { passwordHash: 0 } }
      );
      return NextResponse.json(result, { status: 200 });
    }

    const customer: Customer = {
      name,
      email,
      phone,
      loyaltyPoints: { [session.tenantId.toString()]: 0 },
      createdAt: new Date(),
    };

    const result = await db.collection<Customer>('customers').insertOne(customer);
    return NextResponse.json({ _id: result.insertedId, ...customer }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to create customer', error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { _id, ...rest } = body;

    if (!_id) return NextResponse.json({ message: 'Missing customer ID' }, { status: 400 });

    const updates: Record<string, any> = {};
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (key in rest) updates[key] = rest[key];
    }

    const db = await getDatabase();
    const result = await db.collection<Customer>('customers').findOneAndUpdate(
      // Scoped to customers this tenant actually has a relationship with.
      { _id: new ObjectId(_id), [`loyaltyPoints.${session.tenantId.toString()}`]: { $exists: true } },
      { $set: updates },
      { returnDocument: 'after', projection: { passwordHash: 0 } }
    );

    if (!result) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to update customer', error: error.message }, { status: 500 });
  }
}
