// src/app/api/platform/audit-log/route.ts
//
// Read-only viewer over the auditLogs collection every mutating platform
// route writes to (see lib/auditLog.ts). Filterable by target type and a
// free-text match against actor email / action name, paginated newest-first
// — this collection only grows, so no route here ever deletes from it.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['super_admin']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const params = req.nextUrl.searchParams;
    const targetType = params.get('targetType');
    const q = (params.get('q') || '').trim();
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') || '30', 10) || 30));

    const filter: Record<string, unknown> = {};
    if (targetType) filter.targetType = targetType;
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ actorEmail: re }, { action: re }];
    }

    const db = await getDatabase();
    const [entries, total] = await Promise.all([
      db
        .collection('auditLogs')
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      db.collection('auditLogs').countDocuments(filter),
    ]);

    return NextResponse.json({ entries, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to load audit log', error: error.message }, { status: 500 });
  }
}
