// src/app/api/public/search/route.ts
//
// Discovery search. Two fixes/extensions bundled in one pass (see
// AUDIT_REPORT.md and PROGRESS2.md Phase F — this route was going to be
// touched twice otherwise):
//   1. Audit fix: `q` is regex-escaped before hitting $regex — previously
//      raw user input reached the regex engine (ReDoS / malformed-pattern
//      500 risk).
//   2. Phase F: service results now carry their tenant's name/slug (so a
//      result is actually clickable — previously a service card had no
//      link to the salon it belonged to, and could show for a since-
//      suspended tenant since services were never filtered against
//      tenant.status). Optional lat/lng adds a distance-from-me sort and
//      maxDistanceKm filter for "near me" browsing, using the geolocation
//      the client already asked permission for.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { escapeRegex } from '@/lib/text';
import { haversineKm } from '@/lib/geo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const rawQuery = req.nextUrl.searchParams.get('q') || '';
    const query = escapeRegex(rawQuery);
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20') || 20, 100);
    const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
    const lng = parseFloat(req.nextUrl.searchParams.get('lng') || '');
    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
    const maxDistanceKmParam = req.nextUrl.searchParams.get('maxDistanceKm');
    const maxDistanceKm = maxDistanceKmParam ? parseFloat(maxDistanceKmParam) : undefined;

    const db = await getDatabase();

    // All active tenants — used both to render "Salons" results and as the
    // join/allowlist for "Services" results (a suspended tenant's services
    // must never surface here).
    const activeTenants = await db
      .collection('tenants')
      .find({ status: 'active' }, { projection: { name: 1, slug: 1, branding: 1 } })
      .toArray();
    const tenantById = new Map(activeTenants.map((t) => [t._id.toString(), t]));

    let matchedTenants = query
      ? activeTenants.filter((t) => new RegExp(query, 'i').test(t.name) || new RegExp(query, 'i').test(t.slug))
      : activeTenants;

    // Services matched by name/description, restricted to active tenants.
    const activeTenantIds = activeTenants.map((t) => t._id);
    const serviceFilter: Record<string, any> = { tenantId: { $in: activeTenantIds } };
    if (query) {
      serviceFilter.$or = [{ name: { $regex: query, $options: 'i' } }, { description: { $regex: query, $options: 'i' } }];
    }
    const rawServices = await db
      .collection('services')
      .find(serviceFilter, { projection: { tenantId: 1, name: 1, price: 1, duration: 1, imageUrl: 1 } })
      .limit(limit)
      .toArray();

    const services = rawServices
      .map((s) => {
        const tenant = tenantById.get(s.tenantId.toString());
        if (!tenant) return null;
        return { ...s, tenantName: tenant.name, tenantSlug: tenant.slug };
      })
      .filter(Boolean);

    // Distance: only computed when the caller supplied geolocation. A
    // tenant's location lives on siteSettings, not the tenant document.
    let tenantsWithDistance: any[] = matchedTenants;
    if (hasGeo) {
      const tenantIds = matchedTenants.map((t) => t._id);
      const settingsList = await db
        .collection('siteSettings')
        .find({ tenantId: { $in: tenantIds } }, { projection: { tenantId: 1, location: 1 } })
        .toArray();
      const locationByTenant = new Map(
        settingsList.filter((s) => s.location?.lat != null && s.location?.lng != null).map((s) => [s.tenantId.toString(), s.location])
      );

      tenantsWithDistance = matchedTenants
        .map((t) => {
          const loc = locationByTenant.get(t._id.toString());
          const distanceKm = loc ? haversineKm({ lat, lng }, loc) : null;
          return { ...t, distanceKm, lat: loc?.lat ?? null, lng: loc?.lng ?? null };
        })
        .filter((t) => (maxDistanceKm != null ? t.distanceKm != null && t.distanceKm <= maxDistanceKm : true))
        .sort((a, b) => {
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm - b.distanceKm;
        });

      // Barber discovery (Part 3): attach each pinned salon's barbers so the
      // map popup can list/link to them, not just the salon. Only fetched
      // for the tenants actually being returned (post-slice), and only in
      // this hasGeo branch — the map isn't shown on the plain text-search
      // path, so there's no point paying for this lookup there.
      const pinnedTenants = tenantsWithDistance.slice(0, limit);
      const pinnedTenantIds = pinnedTenants.map((t) => t._id);
      const barbersRaw = await db
        .collection('barbers')
        .find({ tenantId: { $in: pinnedTenantIds } }, { projection: { tenantId: 1, name: 1, slug: 1, imageUrl: 1 } })
        .toArray();
      const barbersByTenant = new Map<string, { _id: string; name: string; slug: string; imageUrl?: string }[]>();
      for (const b of barbersRaw) {
        const key = b.tenantId.toString();
        const list = barbersByTenant.get(key) || [];
        list.push({ _id: b._id.toString(), name: b.name, slug: b.slug, imageUrl: b.imageUrl });
        barbersByTenant.set(key, list);
      }
      tenantsWithDistance = tenantsWithDistance.map((t) => ({
        ...t,
        barbers: barbersByTenant.get(t._id.toString()) || [],
      }));
    }

    return NextResponse.json({
      tenants: tenantsWithDistance.slice(0, limit),
      services,
      query: rawQuery,
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Search failed', error: error.message }, { status: 500 });
  }
}
