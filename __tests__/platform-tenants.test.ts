// __tests__/platform-tenants.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { FakeDb } from './helpers/fakeMongo';

const fakeDb = vi.hoisted(() => ({ db: null as any }));

const pdf = vi.hoisted(() => ({ build: vi.fn(async (_i: any) => 'JVBERi0xLjQK') }));

vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));
// Real PDF generation is covered in welcome-pdf.test.ts; stubbed here to keep this file about tenant logic.
vi.mock('@/lib/welcomePdf', () => ({ buildWelcomePdfBase64: (i: any) => pdf.build(i) }));

function hash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function superAdminToken(db: FakeDb) {
  const rawToken = crypto.randomBytes(16).toString('hex');
  db.collection('sessions').seed([
    ...db.collection('sessions').docs,
    { tokenHash: hash(rawToken), subjectId: new ObjectId(), subjectType: 'user', role: 'super_admin', expiresAt: new Date(Date.now() + 60_000) },
  ]);
  return rawToken;
}

function tenantStaffToken(db: FakeDb, tenantId: ObjectId) {
  const rawToken = crypto.randomBytes(16).toString('hex');
  db.collection('sessions').seed([
    ...db.collection('sessions').docs,
    { tokenHash: hash(rawToken), subjectId: new ObjectId(), subjectType: 'user', role: 'admin', tenantId, expiresAt: new Date(Date.now() + 60_000) },
  ]);
  return rawToken;
}

function req(method: string, rawToken?: string, body?: any) {
  return new Request('http://localhost/api/platform/tenants', {
    method,
    headers: { ...(rawToken ? { cookie: `session=${rawToken}` } : {}), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

describe('GET /api/platform/tenants', () => {
  beforeEach(() => {
    fakeDb.db = new FakeDb();
  });

  it('rejects a tenant-scoped admin — this is super_admin only', async () => {
    const { GET } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = tenantStaffToken(db, new ObjectId());
    const res = await GET(req('GET', rawToken));
    expect(res.status).toBe(401);
  });

  it('super_admin sees every tenant across the platform', async () => {
    const { GET } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    db.collection('tenants').seed([
      { _id: new ObjectId(), slug: 'salon-a', name: 'Salon A', status: 'active' },
      { _id: new ObjectId(), slug: 'salon-b', name: 'Salon B', status: 'suspended' },
    ]);
    const rawToken = superAdminToken(db);
    const res = await GET(req('GET', rawToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});

describe('POST /api/platform/tenants', () => {
  beforeEach(() => {
    fakeDb.db = new FakeDb();
  });

  it('creates a tenant, its first admin user, and default siteSettings in one call', async () => {
    const { POST } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = superAdminToken(db);

    const res = await POST(
      req('POST', rawToken, {
        slug: 'new-salon',
        name: 'New Salon',
        contactEmail: 'contact@new-salon.test',
        adminEmail: 'admin@new-salon.test',
        adminPassword: 'StrongPass123!',
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const tenantId = body._id;

    const adminUser = await db.collection('users').findOne({ email: 'admin@new-salon.test' });
    expect(adminUser?.role).toBe('admin');
    expect(adminUser?.tenantId.toString()).toBe(tenantId.toString());
    // Password must be hashed, never stored in plaintext.
    expect(adminUser?.passwordHash).not.toBe('StrongPass123!');

    const settings = await db.collection('siteSettings').findOne({ tenantId });
    expect(settings?.title).toBe('New Salon');
  });

  it('makes the owner\'s password a STARTING password (must be changed at first sign-in) and lower-cases the email', async () => {
    const { POST } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    const res = await POST(req('POST', superAdminToken(db), { slug: 'quano-locs', name: 'Quano Locs', contactEmail: 'q@x.test', adminEmail: 'Quano-Locs@Chair.app', adminPassword: 'Quano-P@ss' }));
    expect(res.status).toBe(201);
    const owner = await db.collection('users').findOne({ email: 'quano-locs@chair.app' });
    expect(owner).toMatchObject({ role: 'admin', mustChangePassword: true });
    expect(owner!.tempPasswordExpiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  it('returns the owner\'s welcome PDF, built from the details just entered (password only in memory)', async () => {
    const { POST } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    const body = await (await POST(req('POST', superAdminToken(db), { slug: 'quano-locs', name: 'Quano Locs', contactEmail: 'q@x.test', adminEmail: 'quano-locs@chair.app', adminPassword: 'Quano-P@ss' }))).json();
    expect(body.welcomePdf).toBe('JVBERi0xLjQK');
    expect(pdf.build).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'admin', salonName: 'Quano Locs', tenantSlug: 'quano-locs', email: 'quano-locs@chair.app', password: 'Quano-P@ss', mustChangePassword: true }));
    expect(JSON.stringify(db.collection('users').docs)).not.toContain('Quano-P@ss');
  });

  it('still creates the salon (welcomePdf: null) if PDF generation fails', async () => {
    const { POST } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    pdf.build.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(req('POST', superAdminToken(db), { slug: 'no-pdf', name: 'No Pdf', contactEmail: 'q@x.test', adminEmail: 'o@x.test', adminPassword: 'Strong-Pass-1' }));
    expect(res.status).toBe(201);
    expect((await res.json()).welcomePdf).toBeNull();
    expect(await db.collection('tenants').countDocuments({ slug: 'no-pdf' })).toBe(1);
  });

  it.each([
    ['a slug with capitals or spaces', { slug: 'Bad Slug' }],
    ['a slug with a leading hyphen', { slug: '-nope' }],
    ['a too-common owner password', { adminPassword: 'password' }],
    ['an owner password shorter than 8', { adminPassword: 'Ab1!' }],
    ['an invalid owner email', { adminEmail: 'not-an-email' }],
  ])('rejects %s and creates nothing', async (_l, patch) => {
    const { POST } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    const res = await POST(req('POST', superAdminToken(db), { slug: 'ok-slug', name: 'X', contactEmail: 'q@x.test', adminEmail: 'o@x.test', adminPassword: 'Strong-Pass-1', ...patch }));
    expect(res.status).toBe(400);
    expect(await db.collection('tenants').countDocuments({})).toBe(0);
  });

  it('rejects a duplicate slug with 409 and creates nothing', async () => {
    const { POST } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    db.collection('tenants').seed([{ _id: new ObjectId(), slug: 'taken-slug', name: 'Existing', status: 'active' }]);
    const rawToken = superAdminToken(db);

    const res = await POST(
      req('POST', rawToken, {
        slug: 'taken-slug',
        name: 'Second Salon',
        contactEmail: 'x@example.test',
        adminEmail: 'admin2@example.test',
        adminPassword: 'StrongPass123!',
      })
    );
    expect(res.status).toBe(409);
    expect(await db.collection('users').countDocuments({ email: 'admin2@example.test' })).toBe(0);
  });

  it('rejects missing required fields', async () => {
    const { POST } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = superAdminToken(db);
    const res = await POST(req('POST', rawToken, { slug: 'incomplete' }));
    expect(res.status).toBe(400);
  });

  it('a tenant-scoped admin cannot create a new tenant', async () => {
    const { POST } = await import('@/app/api/platform/tenants/route');
    const db = fakeDb.db as FakeDb;
    const rawToken = tenantStaffToken(db, new ObjectId());
    const res = await POST(req('POST', rawToken, { slug: 'x', name: 'X', contactEmail: 'x@x.test', adminEmail: 'a@x.test', adminPassword: 'pw' }));
    expect(res.status).toBe(401);
  });
});
