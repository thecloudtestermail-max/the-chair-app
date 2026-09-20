// src/app/api/platform/tenants/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { Tenant, Barber } from '@/lib/types';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password';
import { isValidEmail, normalizeEmail } from '@/lib/identity';
import { TEMP_PASSWORD_TTL_DAYS } from '@/lib/staffAuth';
import { buildWelcomePdfBase64 } from '@/lib/welcomePdf';
import { SUPPORT_EMAIL } from '@/lib/support';

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
    const { slug, name, contactEmail, primaryColor, adminPassword } = body;
    const adminEmail = normalizeEmail(body.adminEmail);

    if (!slug || !name || !contactEmail || !adminEmail || !adminPassword) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }
    // The slug becomes part of every URL and QR code for this salon.
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json({ message: 'Slug may only contain lowercase letters, numbers and single hyphens' }, { status: 400 });
    }
    if (!isValidEmail(adminEmail)) {
      return NextResponse.json({ message: 'Enter a valid owner email address' }, { status: 400 });
    }
    const passwordProblem = validatePassword(adminPassword, adminEmail);
    if (passwordProblem) return NextResponse.json({ message: passwordProblem }, { status: 400 });

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

    // Create first admin user. The password you typed is a STARTING password:
    // it is printed in the owner's welcome PDF, and the owner is made to
    // choose their own the first time they sign in.
    const passwordHash = await hashPassword(adminPassword);
    const passwordExpiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_DAYS * 24 * 60 * 60_000);
    const adminUser = {
      tenantId,
      username: 'Admin',
      email: adminEmail,
      passwordHash,
      role: 'admin',
      mustChangePassword: true,
      tempPasswordExpiresAt: passwordExpiresAt,
      welcomeIssuedAt: new Date(),
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

    let welcomePdf: string | null = null;
    try {
      welcomePdf = await buildWelcomePdfBase64({
        role: 'admin', salonName: name, tenantSlug: slug, personName: name, email: adminEmail,
        password: adminPassword, mustChangePassword: true, passwordExpiresAt, supportEmail: SUPPORT_EMAIL,
      });
    } catch (err) {
      // The salon exists either way; the super admin can still hand over the password by hand.
      console.error('Welcome PDF failed:', err);
    }

    return NextResponse.json({ _id: tenantId, ...tenant, adminEmail, welcomePdf, passwordExpiresAt }, { status: 201 });
  } catch (error: any) {
    console.error('Create tenant error:', error);
    return NextResponse.json({ message: 'Failed to create tenant', error: error.message }, { status: 500 });
  }
}
