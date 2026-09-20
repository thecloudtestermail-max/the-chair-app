// src/app/api/tenant/settings/route.ts
//
// New in Part 2 — the dashboard's Settings screen needs to read AND write
// siteSettings (branding, contact info, location); the public
// /api/public/tenants/[slug] endpoint is read-only and unauthenticated, so
// it can't be reused for this. Tenant scoping is session-derived, same
// pattern as every other staff route.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { SiteSettings, Tenant } from '@/lib/types';
import { isKnownCurrency } from '@/lib/currency';

export const dynamic = 'force-dynamic';

const ALLOWED_SETTINGS_FIELDS = ['title', 'description', 'logoUrl', 'coverImageUrl', 'phone', 'email', 'location', 'socialLinks'];
const ALLOWED_BRANDING_FIELDS = ['primaryColor', 'secondaryColor', 'font', 'logoUrl'];

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist', 'barber']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDatabase();
    const [tenant, settings] = await Promise.all([
      db.collection<Tenant>('tenants').findOne({ _id: session.tenantId }, { projection: { name: 1, slug: 1, branding: 1, currency: 1 } }),
      db.collection<SiteSettings>('siteSettings').findOne({ tenantId: session.tenantId }),
    ]);
    if (!tenant) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });

    return NextResponse.json({ tenant, settings });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch settings', error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireRole(req, ['admin']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { settings, branding, currency } = body;

    const db = await getDatabase();
    let updatedSettings = null;
    let updatedTenant = null;

    if (settings && typeof settings === 'object') {
      const updates: Record<string, any> = {};
      for (const key of ALLOWED_SETTINGS_FIELDS) {
        if (key in settings) updates[key] = settings[key];
      }
      updatedSettings = await db.collection<SiteSettings>('siteSettings').findOneAndUpdate(
        { tenantId: session.tenantId },
        { $set: updates, $setOnInsert: { tenantId: session.tenantId } },
        { returnDocument: 'after', upsert: true }
      );
    }

    const tenantUpdates: Record<string, any> = {};
    if (branding && typeof branding === 'object') {
      for (const key of ALLOWED_BRANDING_FIELDS) {
        if (key in branding) tenantUpdates[`branding.${key}`] = branding[key];
      }
    }
    // Currency lives on the tenant document, not siteSettings, so every
    // price displayed anywhere (dashboard, booking, discovery) reads from
    // one place — see lib/currency.ts.
    if (typeof currency === 'string' && isKnownCurrency(currency)) {
      tenantUpdates.currency = currency;
    }
    if (Object.keys(tenantUpdates).length > 0) {
      updatedTenant = await db.collection<Tenant>('tenants').findOneAndUpdate(
        { _id: session.tenantId },
        { $set: tenantUpdates },
        { returnDocument: 'after', projection: { name: 1, slug: 1, branding: 1, currency: 1 } }
      );
    }

    return NextResponse.json({ settings: updatedSettings, tenant: updatedTenant });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to update settings', error: error.message }, { status: 500 });
  }
}
