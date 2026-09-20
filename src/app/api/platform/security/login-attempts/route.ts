// src/app/api/platform/security/login-attempts/route.ts
//
// Surfaces failed sign-in attempts against the platform-admin door
// specifically (loginAttempts.scope === 'admin' — see api/admin/login and
// lib/rateLimit.ts, which records exactly one row per FAILED attempt on
// that scope, nothing on success). Grouped by email+ip so a burst of
// guesses against one account shows as one row with a count, not fifty
// separate lines.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const hours = Math.min(24 * 30, Math.max(1, parseInt(req.nextUrl.searchParams.get('hours') || '168', 10) || 168));
    const since = new Date(Date.now() - hours * 60 * 60_000);

    const db = await getDatabase();
    const grouped = await db
      .collection('loginAttempts')
      .aggregate([
        { $match: { scope: 'admin', createdAt: { $gte: since } } },
        {
          $group: {
            _id: { email: '$email', ip: '$ip' },
            count: { $sum: 1 },
            lastAttempt: { $max: '$createdAt' },
            firstAttempt: { $min: '$createdAt' },
          },
        },
        { $sort: { lastAttempt: -1 } },
        { $limit: 100 },
      ])
      .toArray();

    return NextResponse.json(
      grouped.map((g: any) => ({ email: g._id.email, ip: g._id.ip, count: g.count, lastAttempt: g.lastAttempt, firstAttempt: g.firstAttempt }))
    );
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to load login attempts', error: error.message }, { status: 500 });
  }
}
