// src/app/api/platform/overview/route.ts
//
// KPI summary for the admin landing page: tenant counts by status, staff/
// customer/appointment totals, appointments in the last 30 days, and the
// most recently created tenants. One call, several cheap counts — no
// per-tenant joins, so this stays fast even with thousands of tenants.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDatabase();
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);

    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalStaff,
      totalCustomers,
      totalAppointments,
      appointments30d,
      recentTenants,
      recentAppointmentsByDay,
    ] = await Promise.all([
      db.collection('tenants').countDocuments({}),
      db.collection('tenants').countDocuments({ status: 'active' }),
      db.collection('tenants').countDocuments({ status: 'suspended' }),
      db.collection('users').countDocuments({ role: { $ne: 'super_admin' } }),
      db.collection('customers').countDocuments({}),
      db.collection('appointments').countDocuments({}),
      db.collection('appointments').countDocuments({ dateTime: { $gte: since30 } }),
      db
        .collection('tenants')
        .find({}, { projection: { name: 1, slug: 1, status: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray(),
      db
        .collection('tenants')
        .aggregate([
          { $match: { createdAt: { $gte: since30 } } },
          { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
          { $group: { _id: '$day', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
    ]);

    return NextResponse.json({
      tenants: { total: totalTenants, active: activeTenants, suspended: suspendedTenants },
      totalStaff,
      totalCustomers,
      totalAppointments,
      appointments30d,
      recentTenants,
      signupTimeline: recentAppointmentsByDay.map((r: any) => ({ day: r._id, count: r.count })),
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to load overview', error: error.message }, { status: 500 });
  }
}
