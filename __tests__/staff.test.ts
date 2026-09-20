// __tests__/staff.test.ts
//
// Adding staff creates their account with a TEMPORARY password and returns a
// welcome PDF. (PDF generation itself is covered in welcome-pdf.test.ts; here
// it is stubbed so these tests stay about the account logic.)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { FakeDb } from './helpers/fakeMongo';
import { jsonReq, seedStaffSession, seedTenant, seedUser } from './helpers/authFixtures';

const fakeDb = vi.hoisted(() => ({ db: null as any }));
const pdf = vi.hoisted(() => ({ build: vi.fn(async (_i: any) => 'JVBERi0xLjQK') }));
vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));
vi.mock('@/lib/welcomePdf', () => ({ buildWelcomePdfBase64: (i: any) => pdf.build(i) }));

describe('staff management', () => {
  let db: FakeDb, tenant: any, owner: any, cookie: string;
  const staff = () => import('@/app/api/staff/route');
  const resend = () => import('@/app/api/staff/resend/route');

  beforeEach(async () => {
    db = fakeDb.db = new FakeDb();
    pdf.build.mockClear();
    tenant = seedTenant(db, 'quano-locs', 'active', 'Quano Locs');
    owner = await seedUser(db, tenant._id, { email: 'owner@quano.test', role: 'admin', password: 'Owner-Pass-123', username: 'Quano Owner' });
    cookie = seedStaffSession(db, { role: 'admin', tenantId: tenant._id, subjectId: owner._id });
  });

  const add = async (body: any, c = cookie) => (await staff()).POST(jsonReq('/api/staff', body, { cookie: c }));

  it('creates a barber with a temp password, a linked public profile, and a welcome PDF', async () => {
    const res = await add({ name: 'Marcus Lee', email: 'Marcus@Quano.test', role: 'barber' });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.tempPassword).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(body.welcomePdf).toBe('JVBERi0xLjQK');
    expect(body.status).toBe('invited');

    const user = db.collection('users').docs.find((u) => u.email === 'marcus@quano.test')!;
    expect(user.mustChangePassword).toBe(true);
    expect(user.passwordHash).not.toBe(body.tempPassword);
    expect(user.tempPasswordExpiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    const profile = db.collection('barbers').docs.find((b) => b._id.toString() === user.barberId.toString())!;
    expect(profile).toMatchObject({ name: 'Marcus Lee', slug: 'marcus-lee', tenantId: tenant._id });
  });

  it('gives the PDF builder the real details, and the temp password only in memory (never stored in plain text)', async () => {
    const body = await (await add({ name: 'Rita Ray', email: 'rita@quano.test', role: 'receptionist' })).json();
    const input = pdf.build.mock.calls[0][0];
    expect(input).toMatchObject({ role: 'receptionist', salonName: 'Quano Locs', tenantSlug: 'quano-locs', email: 'rita@quano.test', password: body.tempPassword, mustChangePassword: true, issuedBy: 'Quano Owner' });
    expect(JSON.stringify(db.collection('users').docs)).not.toContain(body.tempPassword);
  });

  it('a receptionist gets no barber profile', async () => {
    await add({ name: 'Rita Ray', email: 'rita@quano.test', role: 'receptionist' });
    expect(db.collection('barbers').docs).toHaveLength(0);
  });

  it('two barbers with the same name get distinct profile slugs', async () => {
    await add({ name: 'Alex Kim', email: 'a1@quano.test', role: 'barber' });
    await add({ name: 'Alex Kim', email: 'a2@quano.test', role: 'barber' });
    expect(db.collection('barbers').docs.map((b) => b.slug).sort()).toEqual(['alex-kim', 'alex-kim-2']);
  });

  it('can link an existing profile instead, but not one from another salon', async () => {
    const mine = new ObjectId(), theirs = new ObjectId();
    db.collection('barbers').seed([
      { _id: mine, tenantId: tenant._id, name: 'Existing', slug: 'existing', dailyAvailability: [] },
      { _id: theirs, tenantId: new ObjectId(), name: 'Foreign', slug: 'foreign', dailyAvailability: [] },
    ]);
    expect((await add({ name: 'Linked', email: 'l@quano.test', role: 'barber', barberId: mine.toString() })).status).toBe(201);
    expect(db.collection('users').docs.find((u) => u.email === 'l@quano.test')!.barberId.toString()).toBe(mine.toString());
    expect((await add({ name: 'Bad', email: 'b@quano.test', role: 'barber', barberId: theirs.toString() })).status).toBe(404);
  });

  it('still creates the account and returns the password if the PDF fails', async () => {
    pdf.build.mockRejectedValueOnce(new Error('boom'));
    const body = await (await add({ name: 'Marcus Lee', email: 'm@quano.test', role: 'barber' })).json();
    expect(body.tempPassword).toBeTruthy();
    expect(body.welcomePdf).toBeNull();
  });

  it.each([
    ['an admin role (only the platform admin creates owners)', { name: 'X', email: 'x@q.test', role: 'admin' }, 400],
    ['a missing field', { name: 'X', role: 'barber' }, 400],
    ['an invalid email', { name: 'X', email: 'nope', role: 'barber' }, 400],
  ])('rejects %s', async (_l, body, status) => {
    expect((await add(body)).status).toBe(status);
  });

  it('409 for a duplicate email at the same salon', async () => {
    await add({ name: 'Marcus', email: 'm@quano.test', role: 'barber' });
    expect((await add({ name: 'Marcus 2', email: 'M@quano.test', role: 'receptionist' })).status).toBe(409);
  });

  it('only an admin can add staff', async () => {
    const barber = seedStaffSession(db, { role: 'barber', tenantId: tenant._id });
    expect((await add({ name: 'X', email: 'x@q.test', role: 'barber' }, barber)).status).toBe(401);
  });

  it('the list shows invited until they choose their own password, and never leaks hashes', async () => {
    await add({ name: 'Marcus', email: 'm@quano.test', role: 'barber' });
    const list = await ((await (await staff()).GET(jsonReq('/api/staff', undefined, { cookie }))).json());
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('invited');
    expect(list[0].passwordHash).toBeUndefined();
    db.collection('users').docs.find((u) => u.email === 'm@quano.test')!.mustChangePassword = false;
    expect((await ((await (await staff()).GET(jsonReq('/api/staff', undefined, { cookie }))).json()))[0].status).toBe('active');
  });

  it('never lists the owner or another salon\'s staff', async () => {
    const other = seedTenant(db, 'other');
    await seedUser(db, other._id, { email: 'x@other.test', role: 'barber', password: 'Whatever-123' });
    expect(await ((await (await staff()).GET(jsonReq('/api/staff', undefined, { cookie }))).json())).toEqual([]);
  });

  describe('Reissue access', () => {
    it('gives a NEW temp password + PDF, kills the old password and every session, and works for active staff too', async () => {
      const marcus = await seedUser(db, tenant._id, { email: 'm@quano.test', role: 'barber', password: 'My-Own-Pass-77', mustChangePassword: false });
      const theirSession = seedStaffSession(db, { role: 'barber', tenantId: tenant._id, subjectId: marcus._id });
      const before = db.collection('users').docs.find((u) => u._id === marcus._id)!.passwordHash;

      const res = await (await resend()).POST(jsonReq('/api/staff/resend', { id: marcus._id.toString() }, { cookie }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.tempPassword).toBeTruthy();
      expect(body.welcomePdf).toBeTruthy();
      const after = db.collection('users').docs.find((u) => u._id === marcus._id)!;
      expect(after.passwordHash).not.toBe(before);
      expect(after.mustChangePassword).toBe(true);
      expect(db.collection('sessions').docs.some((s) => s.subjectId === marcus._id)).toBe(false);
      void theirSession;
    });

    it('404 for someone at another salon, and for the owner', async () => {
      const other = seedTenant(db, 'other');
      const foreign = await seedUser(db, other._id, { email: 'f@other.test', role: 'barber', password: 'Whatever-123' });
      expect((await (await resend()).POST(jsonReq('/api/staff/resend', { id: foreign._id.toString() }, { cookie }))).status).toBe(404);
      expect((await (await resend()).POST(jsonReq('/api/staff/resend', { id: owner._id.toString() }, { cookie }))).status).toBe(404);
    });
  });
});
