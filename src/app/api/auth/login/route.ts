// src/app/api/auth/login/route.ts
//
// THE sign-in for every non-platform user: customers, receptionists,
// barbers and salon owners all post an email + password here, from either a
// salon's app (tenantSlug supplied) or the Chair App (no tenantSlug). The
// server works out who the person is; the client only decides where to send
// them afterwards (the `redirect` field).
//
// The platform super_admin is deliberately NOT accepted here: it has its own
// door at /api/admin/login with stricter handling. Unlike before, omitting
// tenantSlug can no longer be used to reach a super_admin account.
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { verifyPassword, createSession, DUMMY_HASH } from '@/lib/auth';
import { createCustomerSession } from '@/lib/customerAuth';
import { setStaffCookie, setCustomerCookie } from '@/lib/authCookies';
import { clientIp, isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { normalizeEmail } from '@/lib/identity';
import type { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    const tenantSlug = typeof body?.tenantSlug === 'string' && body.tenantSlug ? body.tenantSlug : undefined;

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    const ip = clientIp(request);
    if (await isRateLimited('login', email, ip)) {
      return NextResponse.json({ message: 'Too many sign-in attempts. Please wait a few minutes and try again.' }, { status: 429 });
    }

    const db = await getDatabase();

    // Every staff account for this email, at any salon, except the platform admin.
    const staff = ((await db.collection<User>('users').find({ email }).toArray()) as any[]).filter(
      (u) => u.role !== 'super_admin' && u.tenantId
    );
    const tenants = staff.length
      ? ((await db.collection('tenants').find({ _id: { $in: staff.map((u) => u.tenantId) } }).toArray()) as any[])
      : [];
    const tenantById = new Map(tenants.map((t) => [t._id.toString(), t]));
    // A suspended salon's staff can't sign in.
    const eligibleStaff = staff.filter((u) => tenantById.get(u.tenantId.toString())?.status === 'active');

    const customer = (await db.collection('customers').findOne({ email })) as any;

    // Always do the same amount of hashing work whether or not the email exists.
    const staffChecks = await Promise.all(
      eligibleStaff.map(async (u) => ({ user: u, ok: u.passwordHash ? await verifyPassword(password, u.passwordHash) : false }))
    );
    const customerOk = customer?.passwordHash ? await verifyPassword(password, customer.passwordHash) : false;
    if (!eligibleStaff.length && !customer?.passwordHash) await verifyPassword(password, DUMMY_HASH);

    const now = Date.now();
    const matched = staffChecks.filter((c) => c.ok).map((c) => c.user);
    const isExpiredTemp = (u: any) => Boolean(u.mustChangePassword && u.tempPasswordExpiresAt && new Date(u.tempPasswordExpiresAt).getTime() < now);
    const usable = matched.filter((u) => !isExpiredTemp(u));

    if (!usable.length && !customerOk) {
      if (matched.length) {
        // The password was right but it was a temporary one that has lapsed.
        return NextResponse.json(
          { message: 'Your temporary password has expired. Ask your manager to issue a new one, or use "Forgot password".', code: 'temp_expired' },
          { status: 401 }
        );
      }
      await recordAttempt('login', email, ip);
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    // Which staff account to sign into: the salon they're on, if any.
    let chosen = usable;
    if (tenantSlug) {
      const here = usable.filter((u) => tenantById.get(u.tenantId.toString())?.slug === tenantSlug);
      if (here.length) chosen = here;
    }
    if (chosen.length > 1) {
      // Same email + same password at several salons: let the person pick.
      return NextResponse.json({
        needsChoice: true,
        options: chosen.map((u) => {
          const t = tenantById.get(u.tenantId.toString());
          return { tenantSlug: t.slug, tenantName: t.name, role: u.role };
        }),
      });
    }

    let staffInfo: { role: string; tenantSlug: string; mustChangePassword: boolean } | null = null;
    let staffUser: any = null;
    let staffSession: { rawToken: string; expiresAt: Date } | null = null;
    if (chosen.length === 1) {
      staffUser = chosen[0];
      const t = tenantById.get(staffUser.tenantId.toString());
      const mustChange = Boolean(staffUser.mustChangePassword);
      staffSession = await createSession(
        staffUser._id,
        'user',
        staffUser.role,
        staffUser.tenantId,
        staffUser.role === 'barber' ? staffUser.barberId : undefined,
        mustChange
      );
      staffInfo = { role: staffUser.role, tenantSlug: t.slug, mustChangePassword: mustChange };
      await db.collection('users').updateOne({ _id: staffUser._id }, { $set: { lastLoginAt: new Date() } });
    }

    let customerSession: { rawToken: string } | null = null;
    if (customerOk) customerSession = await createCustomerSession(customer._id);

    // Where to land: the dashboard for staff signing in at their own salon (or
    // from the Chair App); the customer view when a person who is both signs
    // in at another salon's app.
    let redirect = tenantSlug ? `/t/${tenantSlug}` : '/';
    if (staffInfo && (!customerSession || !tenantSlug || staffInfo.tenantSlug === tenantSlug)) {
      redirect = `/t/${staffInfo.tenantSlug}/dashboard`;
    }

    const response = NextResponse.json(
      {
        message: 'Signed in',
        user: staffUser ? { _id: staffUser._id, email: staffUser.email, username: staffUser.username, role: staffUser.role } : undefined,
        staff: staffInfo,
        customer: customerSession ? { name: customer.name } : null,
        redirect,
      },
      { status: 200 }
    );
    if (staffSession) setStaffCookie(response, staffSession.rawToken, staffSession.expiresAt);
    if (customerSession) setCustomerCookie(response, customerSession.rawToken);
    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ message: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
}
