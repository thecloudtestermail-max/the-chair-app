// src/app/api/platform/tenants/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { Tenant, Barber } from '@/lib/types';
import { hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Super admin only
  const session = await requireRole(req, ['super_admin']);
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDatabase();
    const tenants = await db
      .collection<Tenant>('tenants')
      .find({})
      .toArray();

    return NextResponse.json(tenants);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch tenants', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Super admin only
  const session = await requireRole(req, ['super_admin']);
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { slug, name, contactEmail, primaryColor, adminEmail, adminPassword } = body;

    if (!slug || !name || !contactEmail || !adminEmail || !adminPassword) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const db = await getDatabase();

    // Check if tenant slug already exists
    const existing = await db.collection('tenants').findOne({ slug });
    if (existing) {
      return NextResponse.json({ message: 'Tenant slug already exists' }, { status: 409 });
    }

    // Create tenant
    const tenant: Tenant = {
      slug,
      name,
      branding: {
        primaryColor: primaryColor || '#2563eb',
      },
      contactEmail,
      status: 'active',
      createdAt: new Date(),
    };

    const tenantResult = await db.collection<Tenant>('tenants').insertOne(tenant);
    const tenantId = tenantResult.insertedId;

    // Create first admin user
    const passwordHash = await hashPassword(adminPassword);
    const adminUser = {
      tenantId,
      username: 'Admin',
      email: adminEmail,
      passwordHash,
      role: 'admin',
      createdAt: new Date(),
    };

    await db.collection('users').insertOne(adminUser);

    // Create default siteSettings
    const settings = {
      tenantId,
      title: name,
      description: `Welcome to ${name}`,
      phone: '',
      email: contactEmail,
      socialLinks: [],
    };

    await db.collection('siteSettings').insertOne(settings);

    // Every tenant gets a default barber representing the shop itself —
    // whether it's a solo operator, a barbershop, or a salon, this gives
    // the establishment something to post/book/appear-on-the-map as from
    // day one, without forcing the admin to name individual staff first.
    const defaultBarber: Barber = {
      tenantId,
      name,
      slug: 'shop',
      dailyAvailability: [],
    };
    await db.collection<Barber>('barbers').insertOne(defaultBarber);

    return NextResponse.json({ _id: tenantId, ...tenant }, { status: 201 });
  } catch (error: any) {
    console.error('Create tenant error:', error);
    return NextResponse.json({ message: 'Failed to create tenant', error: error.message }, { status: 500 });
  }
}
