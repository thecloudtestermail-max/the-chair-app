// __tests__/auth-register-and-me.test.ts
//
// Customer self-registration, and the customer's own profile (/api/customer-auth/me).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeDb } from './helpers/fakeMongo';
import { jsonReq, cookiesOf, seedCustomer, seedCustomerSession } from './helpers/authFixtures';

const fakeDb = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));

const register = async (body: any, ip?: string) => (await import('@/app/api/auth/register/route')).POST(jsonReq('/api/auth/register', body, { ip }));
const good = { name: 'Casey Cust', email: 'Casey@Example.com', phone: '555 010 0100', password: 'Casey-Pass1' };

describe('POST /api/auth/register', () => {
  let db: FakeDb;
  beforeEach(() => { db = fakeDb.db = new FakeDb(); });

  it('creates the account (lower-cased email, hashed password), signs the customer in, and returns where to go', async () => {
    const res = await register({ ...good, tenantSlug: 'demo' });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(res.cookies.get('customerClaim')?.value).toBeTruthy();
    expect(res.cookies.get('session')).toBeUndefined();
    expect(body.redirect).toBe('/t/demo');
    const stored = await db.collection('customers').findOne({ email: 'casey@example.com' });
    expect(stored).toMatchObject({ name: 'Casey Cust', phone: '555 010 0100' });
    expect(stored!.passwordHash).toBeTruthy();
    expect(stored!.passwordHash).not.toBe('Casey-Pass1');
  });

  it('does not let anyone claim an existing record (e.g. an earlier guest booking) just by typing its email', async () => {
    await seedCustomer(db, { email: 'casey@example.com' }); // guest: no password
    const res = await register(good);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('exists');
    expect(db.collection('customers').docs).toHaveLength(1);
    expect(db.collection('customers').docs[0].passwordHash).toBeUndefined();
  });

  it.each([
    ['a too-short password', { password: 'short' }],
    ['a very common password', { password: 'password123' }],
    ['a password equal to the email', { password: 'casey@example.com', email: 'casey@example.com' }],
    ['an invalid email', { email: 'not-an-email' }],
    ['a bad phone number', { phone: 'abc' }],
    ['a missing name', { name: ' ' }],
  ])('rejects %s', async (_label, patch) => {
    expect((await register({ ...good, ...patch })).status).toBe(400);
    expect(db.collection('customers').docs).toHaveLength(0);
  });

  it('is rate limited', async () => {
    let last: any;
    for (let i = 0; i < 6; i++) last = await register({ ...good, email: 'same@example.com' }, '7.7.7.7');
    expect(last.status).toBe(429);
  });
});

describe('/api/customer-auth/me', () => {
  let db: FakeDb;
  beforeEach(() => { db = fakeDb.db = new FakeDb(); });
  const me = async (method: 'GET' | 'PATCH', cookie?: string, body?: any) => {
    const mod = await import('@/app/api/customer-auth/me/route');
    return mod[method](jsonReq('/api/customer-auth/me', body, { method, cookie }));
  };

  it('401 without a customer session', async () => {
    expect((await me('GET')).status).toBe(401);
  });

  it('a STAFF session is not a customer session', async () => {
    expect((await me('GET', 'session=abc')).status).toBe(401);
  });

  it('returns the profile including phone', async () => {
    const c = await seedCustomer(db, { email: 'j@x.test', name: 'Jamie', phone: '555 010 0111' });
    const body = await (await me('GET', seedCustomerSession(db, c._id))).json();
    expect(body).toMatchObject({ name: 'Jamie', email: 'j@x.test', phone: '555 010 0111' });
  });

  it('PATCH updates name and phone, never the email, and validates', async () => {
    const c = await seedCustomer(db, { email: 'j@x.test', name: 'Jamie' });
    const cookie = seedCustomerSession(db, c._id);
    const ok = await me('PATCH', cookie, { name: 'Jamie R', phone: '555 010 0222', email: 'hacker@x.test' });
    expect(ok.status).toBe(200);
    const stored = db.collection('customers').docs[0];
    expect(stored).toMatchObject({ name: 'Jamie R', phone: '555 010 0222', email: 'j@x.test' });
    expect((await me('PATCH', cookie, { phone: 'nope' })).status).toBe(400);
    expect((await me('PATCH', cookie, { name: 'x' })).status).toBe(400);
    expect((await me('PATCH', cookie, {})).status).toBe(400);
  });
});
