// __tests__/password-flows.test.ts
//
// Forgot password (emailed link, or "email support" when no provider is
// configured), reset, and change-while-signed-in. One email = one password
// across every account that email owns.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeDb } from './helpers/fakeMongo';
import { cookiesOf, jsonReq, seedCustomer, seedCustomerSession, seedStaffSession, seedTenant, seedUser, sha } from './helpers/authFixtures';

const fakeDb = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));

const post = async (route: string, body: any, o: { cookie?: string; ip?: string } = {}) => (await import(`@/app/api/auth/${route}/route`)).POST(jsonReq(`/api/auth/${route}`, body, o));
const EMAIL_ENV = ['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY'];

function configureEmail() {
  for (const k of EMAIL_ENV) vi.stubEnv(k, 'x');
  const sent: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => 'OK' }; }));
  return sent;
}
const tokenIn = (sent: any[]) => JSON.stringify(sent[0] ?? {}).match(/reset-password#token=([a-f0-9]+)/)?.[1];

describe('POST /api/auth/forgot', () => {
  let db: FakeDb;
  beforeEach(() => { db = fakeDb.db = new FakeDb(); for (const k of EMAIL_ENV) vi.stubEnv(k, ''); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('with NO email provider: tells the person to email geehyness22@gmail.com, and creates no token', async () => {
    await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const body = await (await post('forgot', { email: 'casey@example.com' })).json();
    expect(body.delivery).toBe('manual');
    expect(body.supportEmail).toBe('geehyness22@gmail.com');
    expect(body.message).toContain('geehyness22@gmail.com');
    expect(db.collection('passwordResets').docs).toHaveLength(0);
  });

  it('gives the same reply for an unknown email (no account enumeration), with or without a provider', async () => {
    await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const real = await (await post('forgot', { email: 'casey@example.com' }, { ip: '1.1.1.1' })).json();
    const fake = await (await post('forgot', { email: 'nobody@example.com' }, { ip: '1.1.1.1' })).json();
    expect(real).toEqual(fake);

    configureEmail();
    const real2 = await (await post('forgot', { email: 'casey@example.com' }, { ip: '2.2.2.2' })).json();
    const fake2 = await (await post('forgot', { email: 'nobody@example.com' }, { ip: '2.2.2.2' })).json();
    expect(real2).toEqual(fake2);
  });

  it('with a provider: emails a link whose token is in the URL FRAGMENT, and stores only its hash', async () => {
    await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const sent = configureEmail();
    const body = await (await post('forgot', { email: 'CASEY@example.com', tenantSlug: 'demo' })).json();
    expect(body.delivery).toBe('email');
    const token = tokenIn(sent);
    expect(token).toBeTruthy();
    expect(JSON.stringify(sent[0])).toContain('from=demo');
    const stored = db.collection('passwordResets').docs[0];
    expect(stored.tokenHash).toBe(sha(token!));
    expect(JSON.stringify(stored)).not.toContain(token!);
  });

  it('sends nothing for an unknown email', async () => {
    const sent = configureEmail();
    await post('forgot', { email: 'nobody@example.com' });
    expect(sent).toHaveLength(0);
  });

  it('if the provider fails for a real account, falls back to the manual instruction', async () => {
    await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    for (const k of EMAIL_ENV) vi.stubEnv(k, 'x');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' })));
    expect((await (await post('forgot', { email: 'casey@example.com' })).json()).delivery).toBe('manual');
  });

  it('validates the email and rate limits', async () => {
    expect((await post('forgot', { email: 'nope' })).status).toBe(400);
    let last: any;
    for (let i = 0; i < 6; i++) last = await post('forgot', { email: 'a@b.com' }, { ip: '6.6.6.6' });
    expect(last.status).toBe(429);
  });
});

describe('POST /api/auth/reset', () => {
  let db: FakeDb;
  beforeEach(() => { db = fakeDb.db = new FakeDb(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  async function requestLink(email: string) {
    const sent = configureEmail();
    await post('forgot', { email }, { ip: '3.3.3.3' });
    return tokenIn(sent)!;
  }

  it('sets the new password, ends old sessions, and the link works only once', async () => {
    const c = await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const oldCookie = seedCustomerSession(db, c._id);
    const token = await requestLink('casey@example.com');

    expect((await post('reset', { token, password: 'password' })).status).toBe(400); // weak: link stays valid
    expect((await post('reset', { token, password: 'Fresh-Casey-Pass9' })).status).toBe(200);
    expect((await post('reset', { token, password: 'Fresh-Casey-Pass9' })).status).toBe(400); // single use

    expect((await post('login', { email: 'casey@example.com', password: 'Casey-Pass1' }, { ip: '4.4.4.4' })).status).toBe(401);
    expect((await post('login', { email: 'casey@example.com', password: 'Fresh-Casey-Pass9' }, { ip: '4.4.4.4' })).status).toBe(200);
    expect(db.collection('customerClaimSessions').docs.some((s) => s.tokenHash === sha(oldCookie.split('=')[1]))).toBe(false);
  });

  it('a guest with no password can SET one this way', async () => {
    await seedCustomer(db, { email: 'guest@example.com' });
    const token = await requestLink('guest@example.com');
    expect((await post('reset', { token, password: 'My-First-Password1' })).status).toBe(200);
    expect((await post('login', { email: 'guest@example.com', password: 'My-First-Password1' })).status).toBe(200);
  });

  it('one reset sets one password for the person\'s staff AND customer accounts, and clears any forced change', async () => {
    const t = seedTenant(db, 'acme-salon');
    const u = await seedUser(db, t._id, { email: 'marcus@acme.com', role: 'barber', password: 'K7QM-X2PD-9WTA', mustChangePassword: true });
    await seedCustomer(db, { email: 'marcus@acme.com', password: 'Old-Customer-1' });
    const token = await requestLink('marcus@acme.com');
    expect((await post('reset', { token, password: 'Marcus-Own-Pass1' })).status).toBe(200);
    const body = await (await post('login', { email: 'marcus@acme.com', password: 'Marcus-Own-Pass1', tenantSlug: 'acme-salon' })).json();
    expect(body.staff.mustChangePassword).toBe(false);
    expect(body.customer).toBeTruthy();
    expect(db.collection('users').docs.find((x) => x._id === u._id)!.mustChangePassword).toBe(false);
  });

  it('an expired link is refused', async () => {
    await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const token = await requestLink('casey@example.com');
    db.collection('passwordResets').docs[0].expiresAt = new Date(Date.now() - 1000);
    expect((await post('reset', { token, password: 'Fresh-Casey-Pass9' })).status).toBe(400);
  });

  it('the platform super_admin can NOT be reset through the public flow', async () => {
    await seedUser(db, undefined, { email: 'root@platform.com', role: 'super_admin', password: 'Root-Pass-99' });
    const sent = configureEmail();
    await post('forgot', { email: 'root@platform.com' });
    expect(sent).toHaveLength(0);
    expect(db.collection('passwordResets').docs).toHaveLength(0);
  });

  it('a made-up token is refused', async () => {
    expect((await post('reset', { token: 'deadbeef', password: 'Fresh-Casey-Pass9' })).status).toBe(400);
  });
});

describe('POST /api/auth/password (change while signed in)', () => {
  let db: FakeDb;
  beforeEach(() => { db = fakeDb.db = new FakeDb(); });

  it('a staff member on a temporary password replaces it, and the same session then works', async () => {
    const t = seedTenant(db);
    const u = await seedUser(db, t._id, { email: 'new@acme.com', role: 'barber', password: 'K7QM-X2PD-9WTA', mustChangePassword: true });
    const cookie = seedStaffSession(db, { role: 'barber', tenantId: t._id, subjectId: u._id, mustChangePassword: true });

    const res = await post('password', { currentPassword: 'K7QM-X2PD-9WTA', newPassword: 'My-Own-Pass-77' }, { cookie });
    expect(res.status).toBe(200);
    expect(db.collection('users').docs[0].mustChangePassword).toBe(false);
    expect(db.collection('sessions').docs[0].mustChangePassword).toBe(false); // this session is released

    const { requireRole } = await import('@/lib/requireRole');
    expect(await requireRole(jsonReq('/x', undefined, { cookie }), ['barber'])).not.toBeNull();
    expect((await post('login', { email: 'new@acme.com', password: 'K7QM-X2PD-9WTA' })).status).toBe(401);
    expect((await post('login', { email: 'new@acme.com', password: 'My-Own-Pass-77' })).status).toBe(200);
  });

  it('while still on the temporary password, requireRole refuses the session (everything else is locked)', async () => {
    const t = seedTenant(db);
    const cookie = seedStaffSession(db, { role: 'admin', tenantId: t._id, mustChangePassword: true });
    const { requireRole } = await import('@/lib/requireRole');
    expect(await requireRole(jsonReq('/x', undefined, { cookie }), ['admin'])).toBeNull();
  });

  it('a customer changes their password', async () => {
    const c = await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const cookie = seedCustomerSession(db, c._id);
    expect((await post('password', { currentPassword: 'Casey-Pass1', newPassword: 'Casey-Newer-Pass2' }, { cookie })).status).toBe(200);
    expect((await post('login', { email: 'casey@example.com', password: 'Casey-Newer-Pass2' })).status).toBe(200);
  });

  it('keeps the current session but ends the person\'s OTHER sessions', async () => {
    const c = await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const mine = seedCustomerSession(db, c._id);
    const other = seedCustomerSession(db, c._id);
    await post('password', { currentPassword: 'Casey-Pass1', newPassword: 'Casey-Newer-Pass2' }, { cookie: mine });
    const remaining = db.collection('customerClaimSessions').docs.map((s) => s.tokenHash);
    expect(remaining).toContain(sha(mine.split('=')[1]));
    expect(remaining).not.toContain(sha(other.split('=')[1]));
  });

  it.each([
    ['wrong current password', { currentPassword: 'nope-nope-1', newPassword: 'Casey-Newer-Pass2' }, 400],
    ['no current password', { newPassword: 'Casey-Newer-Pass2' }, 400],
    ['weak new password', { currentPassword: 'Casey-Pass1', newPassword: 'short' }, 400],
    ['new password same as old', { currentPassword: 'Casey-Pass1', newPassword: 'Casey-Pass1' }, 400],
    ['new password equal to email', { currentPassword: 'Casey-Pass1', newPassword: 'casey@example.com' }, 400],
  ])('rejects %s', async (_l, body, status) => {
    const c = await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    expect((await post('password', body, { cookie: seedCustomerSession(db, c._id) })).status).toBe(status);
  });

  it('401 when not signed in; 403 for the platform admin (changed with the script instead)', async () => {
    expect((await post('password', { currentPassword: 'a', newPassword: 'b' })).status).toBe(401);
    const root = await seedUser(db, undefined, { email: 'root@platform.com', role: 'super_admin', password: 'Root-Pass-99' });
    const cookie = seedStaffSession(db, { role: 'super_admin', subjectId: root._id });
    expect((await post('password', { currentPassword: 'Root-Pass-99', newPassword: 'Root-Newer-Pass-1' }, { cookie })).status).toBe(403);
  });

  it('wrong-current attempts count toward the same throttle as sign-in failures', async () => {
    const c = await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const cookie = seedCustomerSession(db, c._id);
    let last: any;
    for (let i = 0; i < 6; i++) last = await post('password', { currentPassword: `wrong-wrong-${i}`, newPassword: 'Casey-Newer-Pass2' }, { cookie, ip: '5.5.5.5' });
    expect(last.status).toBe(429);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends BOTH the staff and the customer session and clears both cookies', async () => {
    const db = (fakeDb.db = new FakeDb());
    const t = seedTenant(db);
    const c = await seedCustomer(db, { email: 'casey@example.com', password: 'Casey-Pass1' });
    const cookie = `${seedStaffSession(db, { role: 'admin', tenantId: t._id })}; ${seedCustomerSession(db, c._id)}`;
    const res = await post('logout', {}, { cookie });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('customerClaim=');
    expect(db.collection('sessions').docs).toHaveLength(0);
    expect(db.collection('customerClaimSessions').docs).toHaveLength(0);
  });
});
