// src/app/api/auth/verify/route.ts
import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { readCookie, STAFF_COOKIE } from '@/lib/authCookies';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await verifySessionToken(readCookie(request, STAFF_COOKIE));
    if (!session) {
      return NextResponse.json({ message: 'Invalid session' }, { status: 401 });
    }

    let tenantSlug: string | undefined;
    if (session.tenantId) {
      const db = await getDatabase();
      const tenant = await db.collection('tenants').findOne({ _id: session.tenantId }, { projection: { slug: 1 } });
      tenantSlug = tenant?.slug;
    }

    return NextResponse.json({
      role: session.role,
      subjectId: session.subjectId,
      subjectType: session.subjectType,
      tenantId: session.tenantId,
      tenantSlug,
      mustChangePassword: Boolean(session.mustChangePassword),
    });
  } catch (error: any) {
    console.error('Verify error:', error);
    return NextResponse.json({ message: 'Session verification failed' }, { status: 500 });
  }
}
