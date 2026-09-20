// __tests__/auth-login.test.ts
//
// POST /api/auth/login: THE sign-in for customers, receptionists, barbers and
// owners. The platform super_admin is deliberately NOT accepted here (it has
// /api/admin/login), which closes the old hole where omitting tenantSlug
// reached super_admin accounts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeDb } from './helpers/fakeMongo';
import { cookiesOf, jsonReq, seedCustomer, seedTenant, seedUser } from './helpers/authFixtures';

const fakeDb = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));

const login = async (body: any, ip?: string) => {
  const { POST } = await import('@/app/api/auth/login/route');
  return POST(jsonReq('/api/auth/login', body, { ip }));
};

describe('POST /api/auth/login', () => {
  let db: FakeDb;
  beforeEach(() => { db = fakeDb.db = new FakeDb(); });

  it('signs in salon staff from the salon\'s own app, sets the staff cookie, and sends them to the dashboard', async () => {
    const t = seedTenant(db, 'acme-salon');
    await seedUser(db, t._id, { email: 'admin@acme.com', role: 'admin', password: 'Correct-Pass-1', username: 'Admin' });
    const res = await login({ email: 'admin@acme.com', password: 'Correct-Pass-1', tenantSlug: 'acme-salon' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.cookies.get('session')?.value).toBeTruthy();
    expect(res.cookies.get('customerClaim')).toBeUndefined();
    expect(body.user.role).toBe('admin');
    expect(body.staff).toMatchObject({ role: 'admin', tenantSlug: 'acme-salon', mustChangePassword: false });
    expect(body.redirect).toBe('/t/acme-salon/dashboard');
  });

  it('staff can also sign in from the Chair App (no tenantSlug) and land in THEIR salon', async () => {
    const t = seedTenant(db, 'acme-salon');
    await seedUser(db, t._id, { email: 'rita@acme.com', role: 'receptionist', password: 'Correct-Pass-1' });
    const body = await (await login({ email: 'rita@acme.com', password: 'Correct-Pass-1' })).json();
    expect(body.redirect).toBe('/t/acme-salon/dashboard');
  });

  it('email is case-insensitive', async () => {
    const t = seedTenant(db);
    await seedUser(db, t._id, { email: 'admin@acme.com', role: 'admin', password: 'Correct-Pass-1' });
    expect((await login({ email: '  Admin@ACME.com ', password: 'Correct-Pass-1' })).status).toBe(200);
  });

  it('signs in a customer with email + password: customer cookie only, back to the salon they were on', async () => {
    seedTenant(db, 'acme-salon');
    await seedCustomer(db, { email: 'jamie@example.test', password: 'Correct-Pass-1', name: 'Jamie' });
    const res = await login({ email: 'jamie@example.test', password: 'Correct-Pass-1', tenantSlug: 'acme-salon' });
    const body = await res.json();
    expect(res.cookies.get('customerClaim')?.value).toBeTruthy();
    expect(res.cookies.get('session')).toBeUndefined();
    expect(body).toMatchObject({ customer: { name: 'Jamie' }, staff: null, redirect: '/t/acme-salon' });
  });

  it('a guest (a customer record with no password) cannot sign in', async () => {
    await seedCustomer(db, { email: 'guest@example.test' });
    expect((await login({ email: 'guest@example.test', password: 'anything-at-all' })).status).toBe(401);
  });

  it('rejects a wrong password and an unknown email with the SAME message', async () => {
    const t = seedTenant(db);
    await seedUser(db, t._id, { email: 'admin@acme.com', role: 'admin', password: 'Correct-Pass-1' });
    const wrong = await (await login({ email: 'admin@acme.com', password: 'nope-nope-1' })).json();
    const unknown = await (await login({ email: 'nobody@acme.com', password: 'nope-nope-1' })).json();
    expect(wrong.message).toBe(unknown.message);
  });

  it('rejects login against a suspended salon', async () => {
    const t = seedTenant(db, 'closed-salon', 'suspended');
    await seedUser(db, t._id, { email: 'admin@closed.com', role: 'admin', password: 'Correct-Pass-1' });
    expect((await login({ email: 'admin@closed.com', password: 'Correct-Pass-1', tenantSlug: 'closed-salon' })).status).toBe(401);
  });

  it('the platform super_admin CANNOT sign in here, with or without a tenantSlug', async () => {
    const t = seedTenant(db, 'acme-salon');
    await seedUser(db, undefined, { email: 'root@platform.com', role: 'super_admin', password: 'Root-Pass-99' });
    expect((await login({ email: 'root@platform.com', password: 'Root-Pass-99' })).status).toBe(401);
    expect((await login({ email: 'root@platform.com', password: 'Root-Pass-99', tenantSlug: t.slug })).status).toBe(401);
  });

  it('a person who is both staff and a customer gets both sessions, and lands on the dashboard at their own salon', async () => {
    const t = seedTenant(db, 'acme-salon');
    await seedUser(db, t._id, { email: 'marcus@acme.com', role: 'barber', password: 'Same-Pass-123' });
    await seedCustomer(db, { email: 'marcus@acme.com', password: 'Same-Pass-123' });
    const res = await login({ email: 'marcus@acme.com', password: 'Same-Pass-123', tenantSlug: 'acme-salon' });
    expect(res.cookies.get('session')?.value).toBeTruthy();
    expect(res.cookies.get('customerClaim')?.value).toBeTruthy();
    expect((await res.json()).redirect).toBe('/t/acme-salon/dashboard');
  });

  it('...but at ANOTHER salon\'s app they stay in the customer view', async () => {
    const mine = seedTenant(db, 'acme-salon');
    seedTenant(db, 'other-salon');
    await seedUser(db, mine._id, { email: 'marcus@acme.com', role: 'barber', password: 'Same-Pass-123' });
    await seedCustomer(db, { email: 'marcus@acme.com', password: 'Same-Pass-123' });
    const body = await (await login({ email: 'marcus@acme.com', password: 'Same-Pass-123', tenantSlug: 'other-salon' })).json();
    expect(body.redirect).toBe('/t/other-salon');
  });

  it('same email + password at two salons: asks which one, sets no cookie, then signs in to the chosen one', async () => {
    const a = seedTenant(db, 'salon-a', 'active', 'Salon A');
    const b = seedTenant(db, 'salon-b', 'active', 'Salon B');
    await seedUser(db, a._id, { email: 'multi@x.com', role: 'barber', password: 'Shared-Pass-1' });
    await seedUser(db, b._id, { email: 'multi@x.com', role: 'receptionist', password: 'Shared-Pass-1' });

    const first = await login({ email: 'multi@x.com', password: 'Shared-Pass-1' });
    const body = await first.json();
    expect(body.needsChoice).toBe(true);
    expect(body.options.map((o: any) => o.tenantSlug).sort()).toEqual(['salon-a', 'salon-b']);
    expect(cookiesOf(first)).toBe('');

    const second = await login({ email: 'multi@x.com', password: 'Shared-Pass-1', tenantSlug: 'salon-b' });
    expect((await second.json()).staff.tenantSlug).toBe('salon-b');
  });

  it('flags a temporary password so the client (and API) force a change', async () => {
    const t = seedTenant(db);
    await seedUser(db, t._id, { email: 'new@acme.com', role: 'barber', password: 'K7QM-X2PD-9WTA', mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + 86_400_000) });
    const res = await login({ email: 'new@acme.com', password: 'K7QM-X2PD-9WTA' });
    expect((await res.json()).staff.mustChangePassword).toBe(true);
    const session = db.collection('sessions').docs[0];
    expect(session.mustChangePassword).toBe(true);
  });

  it('an EXPIRED temporary password gets a specific message, not "invalid"', async () => {
    const t = seedTenant(db);
    await seedUser(db, t._id, { email: 'late@acme.com', role: 'barber', password: 'K7QM-X2PD-9WTA', mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() - 1000) });
    const res = await login({ email: 'late@acme.com', password: 'K7QM-X2PD-9WTA' });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('temp_expired');
  });

  it('a legacy invited account (empty passwordHash) cannot sign in', async () => {
    const t = seedTenant(db);
    await seedUser(db, t._id, { email: 'legacy@acme.com', role: 'receptionist', password: '', passwordHash: '' });
    expect((await login({ email: 'legacy@acme.com', password: 'whatever-123' })).status).toBe(401);
  });

  it('rejects missing fields with 400', async () => {
    expect((await login({ email: 'a@b.com' })).status).toBe(400);
  });

  describe('rate limiting (replaces the old per-email counter anyone could abuse)', () => {
    it('throttles repeated failures from one IP', async () => {
      const t = seedTenant(db);
      await seedUser(db, t._id, { email: 'admin@acme.com', role: 'admin', password: 'Correct-Pass-1' });
      let last: any;
      for (let i = 0; i < 6; i++) last = await login({ email: 'admin@acme.com', password: 'guess-guess-1' }, '9.9.9.9');
      expect(last.status).toBe(429);
    });

    it('does NOT lock the real user out because an attacker on another IP failed six times', async () => {
      const t = seedTenant(db);
      await seedUser(db, t._id, { email: 'admin@acme.com', role: 'admin', password: 'Correct-Pass-1' });
      for (let i = 0; i < 6; i++) await login({ email: 'admin@acme.com', password: 'guess-guess-1' }, '9.9.9.9');
      expect((await login({ email: 'admin@acme.com', password: 'Correct-Pass-1' }, '2.2.2.2')).status).toBe(200);
    });

    it('only FAILURES count: many successful sign-ins never trip it', async () => {
      const t = seedTenant(db);
      await seedUser(db, t._id, { email: 'admin@acme.com', role: 'admin', password: 'Correct-Pass-1' });
      let last: any;
      for (let i = 0; i < 8; i++) last = await login({ email: 'admin@acme.com', password: 'Correct-Pass-1' }, '5.5.5.5');
      expect(last.status).toBe(200);
    });
  });
});

describe('POST /api/admin/login', () => {
  beforeEach(() => { fakeDb.db = new FakeDb(); });
  const adminLogin = async (body: any, ip?: string) => (await import('@/app/api/admin/login/route')).POST(jsonReq('/api/admin/login', body, { ip }));

  it('signs the super_admin in and sets a session with no tenant', async () => {
    await seedUser(fakeDb.db, undefined, { email: 'root@platform.com', role: 'super_admin', password: 'Root-Pass-99' });
    const res = await adminLogin({ email: 'Root@Platform.com', password: 'Root-Pass-99' });
    expect(res.status).toBe(200);
    expect(res.cookies.get('session')?.value).toBeTruthy();
    expect((await res.json()).user.role).toBe('super_admin');
  });

  it('refuses salon staff, a wrong password, and an unknown email', async () => {
    const t = seedTenant(fakeDb.db);
    await seedUser(fakeDb.db, t._id, { email: 'admin@acme.com', role: 'admin', password: 'Correct-Pass-1' });
    await seedUser(fakeDb.db, undefined, { email: 'root@platform.com', role: 'super_admin', password: 'Root-Pass-99' });
    expect((await adminLogin({ email: 'admin@acme.com', password: 'Correct-Pass-1' })).status).toBe(401);
    expect((await adminLogin({ email: 'root@platform.com', password: 'wrong-wrong-1' })).status).toBe(401);
    expect((await adminLogin({ email: 'nobody@x.com', password: 'wrong-wrong-1' })).status).toBe(401);
  });

  it('is rate limited on its own', async () => {
    let last: any;
    for (let i = 0; i < 6; i++) last = await adminLogin({ email: 'root@platform.com', password: 'guess-guess-1' }, '8.8.8.8');
    expect(last.status).toBe(429);
  });
});
