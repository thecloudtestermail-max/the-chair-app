// __tests__/auth-session.test.ts
//
// GET /api/auth/verify and POST /api/auth/logout — the two routes every
// authenticated page/layout in this app calls to check/end a staff
// session (see admin/(protected)/layout.tsx, dashboard/layout.tsx,
// t/[tenantSlug]/layout.tsx).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { FakeDb } from './helpers/fakeMongo';

const fakeDb = vi.hoisted(() => ({ db: null as any }));

vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));

function hash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function requestWithCookie(cookie?: string, method: 'GET' | 'POST' = 'GET') {
  return new Request('http://localhost/api/auth/verify', {
    method,
    headers: cookie ? { cookie } : {},
  }) as any;
}

describe('GET /api/auth/verify', () => {
  beforeEach(() => {
    fakeDb.db = new FakeDb();
  });

  it('returns 401 with no session cookie at all', async () => {
    const { GET } = await import('@/app/api/auth/verify/route');
    const res = await GET(requestWithCookie(undefined));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a session token that does not exist in the sessions collection', async () => {
    const { GET } = await import('@/app/api/auth/verify/route');
    const res = await GET(requestWithCookie('session=not-a-real-token'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an EXPIRED session, even though the document still exists', async () => {
    const { GET } = await import('@/app/api/auth/verify/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = crypto.randomBytes(16).toString('hex');
    db.collection('sessions').seed([
      { tokenHash: hash(rawToken), subjectId: new ObjectId(), subjectType: 'user', role: 'admin', tenantId: new ObjectId(), expiresAt: new Date(Date.now() - 1000) },
    ]);
    const res = await GET(requestWithCookie(`session=${rawToken}`));
    expect(res.status).toBe(401);
  });

  it('returns the session role/subjectType/tenantId for a valid session', async () => {
    const { GET } = await import('@/app/api/auth/verify/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = crypto.randomBytes(16).toString('hex');
    const tenantId = new ObjectId();
    const subjectId = new ObjectId();
    db.collection('sessions').seed([
      { tokenHash: hash(rawToken), subjectId, subjectType: 'user', role: 'admin', tenantId, expiresAt: new Date(Date.now() + 60_000) },
    ]);

    const res = await GET(requestWithCookie(`session=${rawToken}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('admin');
    expect(body.subjectType).toBe('user');
    expect(body.tenantId.toString()).toBe(tenantId.toString());
  });
});

describe('sessions and suspended salons', () => {
  beforeEach(() => {
    fakeDb.db = new FakeDb();
  });

  it('verify also reports the salon slug and whether a password change is still required', async () => {
    const { GET } = await import('@/app/api/auth/verify/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = crypto.randomBytes(16).toString('hex');
    const tenantId = new ObjectId();
    db.collection('tenants').seed([{ _id: tenantId, slug: 'demo', status: 'active' }]);
    db.collection('sessions').seed([
      { tokenHash: hash(rawToken), subjectId: new ObjectId(), subjectType: 'user', role: 'barber', tenantId, mustChangePassword: true, expiresAt: new Date(Date.now() + 60_000) },
    ]);
    const body = await (await GET(requestWithCookie(`session=${rawToken}`))).json();
    expect(body.tenantSlug).toBe('demo');
    expect(body.mustChangePassword).toBe(true);
  });

  it('suspending a salon ends its staff sessions IMMEDIATELY, not when each 7-day session runs out', async () => {
    const { GET } = await import('@/app/api/auth/verify/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = crypto.randomBytes(16).toString('hex');
    const tenantId = new ObjectId();
    db.collection('tenants').seed([{ _id: tenantId, slug: 'demo', status: 'active' }]);
    db.collection('sessions').seed([
      { tokenHash: hash(rawToken), subjectId: new ObjectId(), subjectType: 'user', role: 'admin', tenantId, expiresAt: new Date(Date.now() + 60_000) },
    ]);
    expect((await GET(requestWithCookie(`session=${rawToken}`))).status).toBe(200);
    db.collection('tenants').docs[0].status = 'suspended';
    expect((await GET(requestWithCookie(`session=${rawToken}`))).status).toBe(401);
  });

  it('the super_admin session (no tenant) is unaffected by any salon\'s status', async () => {
    const { GET } = await import('@/app/api/auth/verify/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = crypto.randomBytes(16).toString('hex');
    db.collection('sessions').seed([{ tokenHash: hash(rawToken), subjectId: new ObjectId(), subjectType: 'user', role: 'super_admin', expiresAt: new Date(Date.now() + 60_000) }]);
    expect((await GET(requestWithCookie(`session=${rawToken}`))).status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    fakeDb.db = new FakeDb();
  });

  it('deletes the session document matching the cookie\'s token', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = crypto.randomBytes(16).toString('hex');
    db.collection('sessions').seed([
      { tokenHash: hash(rawToken), subjectId: new ObjectId(), subjectType: 'user', role: 'admin', expiresAt: new Date(Date.now() + 60_000) },
    ]);

    const res = await POST(requestWithCookie(`session=${rawToken}`, 'POST'));
    expect(res.status).toBe(200);
    expect(await db.collection('sessions').countDocuments({})).toBe(0);
  });

  it('clears the session cookie in the response even when no cookie was sent', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const res = await POST(requestWithCookie(undefined, 'POST'));
    expect(res.status).toBe(200);
    // NextResponse.cookies.delete() sets an immediately-expiring Set-Cookie header.
    expect(res.headers.get('set-cookie') || '').toMatch(/session=/);
  });

  it('does not throw or delete unrelated sessions when the cookie token matches nothing', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const db = fakeDb.db as FakeDb;
    db.collection('sessions').seed([
      { tokenHash: hash('someone-elses-token'), subjectId: new ObjectId(), subjectType: 'user', role: 'admin', expiresAt: new Date(Date.now() + 60_000) },
    ]);

    const res = await POST(requestWithCookie('session=bogus', 'POST'));
    expect(res.status).toBe(200);
    expect(await db.collection('sessions').countDocuments({})).toBe(1); // untouched
  });
});
