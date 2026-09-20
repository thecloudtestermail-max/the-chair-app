// src/app/api/platform/analytics/route.ts
//
// Platform-wide equivalent of api/analytics/route.ts (that one is
// tenant-scoped, admin-only): bookings/day, revenue/day (completed only),
// new-tenant signups/day, and busiest tenants over the selected window —
// no tenantId filter, and one extra grouping (by tenant instead of by
// barber/service, since "which salons are busiest" is the platform
// question the tenant-level version can't answer).
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 180);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const db = await getDatabase();

    const [appointmentRows, tenantSignupRows, customerSignupRows] = await Promise.all([
      db
        .collection('appointments')
        .aggregate([
          { $match: { dateTime: { $gte: since } } },
          { $lookup: { from: 'services', localField: 'serviceId', foreignField: '_id', as: 'service' } },
          { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } },
          {
            $addFields: {
              servicePrice: { $arrayElemAt: ['$service.price', 0] },
              tenantName: { $arrayElemAt: ['$tenant.name', 0] },
              day: { $dateToString: { format: '%Y-%m-%d', date: '$dateTime' } },
            },
          },
          { $project: { day: 1, status: 1, servicePrice: 1, tenantName: 1 } },
        ])
        .toArray(),
      db
        .collection('tenants')
        .aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
          { $group: { _id: '$day', count: { $sum: 1 } } },
        ])
        .toArray(),
      db
        .collection('customers')
        .aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
          { $group: { _id: '$day', count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const byDay = new Map<string, { bookings: number; revenue: number }>();
    const byTenant = new Map<string, number>();

    for (const r of appointmentRows) {
      const dayEntry = byDay.get(r.day) || { bookings: 0, revenue: 0 };
      dayEntry.bookings += 1;
      if (r.status === 'completed') dayEntry.revenue += r.servicePrice || 0;
      byDay.set(r.day, dayEntry);
      if (r.tenantName) byTenant.set(r.tenantName, (byTenant.get(r.tenantName) || 0) + 1);
    }

    const tenantSignupsByDay = new Map(tenantSignupRows.map((r: any) => [r._id, r.count]));
    const customerSignupsByDay = new Map(customerSignupRows.map((r: any) => [r._id, r.count]));

    const bookingsTimeline = Array.from(byDay.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const allDays = new Set([...tenantSignupsByDay.keys(), ...customerSignupsByDay.keys()]);
    const signupsTimeline = Array.from(allDays)
      .map((day) => ({ day, tenants: tenantSignupsByDay.get(day) || 0, customers: customerSignupsByDay.get(day) || 0 }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const topTenants = Array.from(byTenant.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalRevenue = bookingsTimeline.reduce((sum, d) => sum + d.revenue, 0);
    const totalBookings = bookingsTimeline.reduce((sum, d) => sum + d.bookings, 0);
    const newTenants = Array.from(tenantSignupsByDay.values()).reduce((s, c) => s + c, 0);
    const newCustomers = Array.from(customerSignupsByDay.values()).reduce((s, c) => s + c, 0);

    return NextResponse.json({
      bookingsTimeline,
      signupsTimeline,
      topTenants,
      totalRevenue,
      totalBookings,
      newTenants,
      newCustomers,
      days,
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to compute analytics', error: error.message }, { status: 500 });
  }
}
