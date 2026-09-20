// __tests__/booking.test.ts
//
// 1. Confirms POST /api/t/[tenantSlug]/book validates that the chosen
//    service/barber actually belong to the resolved tenant (PROGRESS.md's
//    Phase 3 claim — confirmed correct).
// 2. UPDATE (Part 2 audit): the staff-facing POST /api/appointments used to
//    have no equivalent ownership check (Part 1 audit finding). PROGRESS2.md
//    Phase C claims this was fixed to mirror the booking route, and the
//    Part 2 audit (AUDIT_REPORT2.md) confirmed that fix is correctly in
//    place (src/app/api/appointments/route.ts:76-86). This test's
//    assertion (expect 400) is therefore CONFIRMED PASSING against the
//    Part 2 codebase, not a known-failing regression test anymore — kept
//    here as the permanent regression guard for this fix. (Comment
//    corrected by the Part 2 audit; the test body itself did not need to
//    change.)
//
// Run with: npx vitest run __tests__/booking.test.ts (not executed here — see note in tenant-scoping.test.ts)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { FakeDb } from './helpers/fakeMongo';

const fakeDb = vi.hoisted(() => ({ db: null as any }));

vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));

describe('POST /api/t/[tenantSlug]/book — public booking', () => {
  let tenantA: ObjectId, tenantB: ObjectId;

  beforeEach(() => {
    fakeDb.db = new FakeDb();
    tenantA = new ObjectId();
    tenantB = new ObjectId();
    (fakeDb.db as FakeDb).collection('tenants').seed([
      { _id: tenantA, slug: 'tenant-a', status: 'active' },
      { _id: tenantB, slug: 'tenant-b', status: 'active' },
    ]);
  });

  it('rejects booking a service that belongs to a different tenant than the URL slug', async () => {
    const { POST } = await import('@/app/api/t/[tenantSlug]/book/route');
    const db = fakeDb.db as FakeDb;

    const tenantBServiceId = new ObjectId();
    const tenantABarberId = new ObjectId();
    db.collection('services').seed([{ _id: tenantBServiceId, tenantId: tenantB, name: 'Tenant B Service' }]);
    db.collection('barbers').seed([{ _id: tenantABarberId, tenantId: tenantA, name: 'Tenant A Barber' }]);

    const req: any = new Request('http://localhost/api/t/tenant-a/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Casey',
        customerEmail: 'casey@example.com',
        customerPhone: '555-0100',
        serviceId: tenantBServiceId.toString(), // belongs to tenant B
        barberId: tenantABarberId.toString(),
        dateTime: new Date().toISOString(),
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ tenantSlug: 'tenant-a' }) });
    expect(res.status).toBe(400);

    const created = await db.collection('appointments').countDocuments({});
    expect(created).toBe(0); // nothing booked
  });

  // A barber with working hours, a service with a duration, and a future
  // slot-aligned time: the double-booking check (server-side re-derivation of
  // free slots) rejects anything else with 409, which the original version of
  // this test overlooked.
  const allWeek = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '00:00', endTime: '23:59' }));
  const futureSlot = () => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(10, 0, 0, 0); return d; };

  async function book(overrides: Record<string, any> = {}) {
    const { POST } = await import('@/app/api/t/[tenantSlug]/book/route');
    const db = fakeDb.db as FakeDb;
    const serviceId = new ObjectId();
    const barberId = new ObjectId();
    db.collection('services').seed([{ _id: serviceId, tenantId: tenantA, name: 'Haircut', duration: 30, price: 25 }]);
    db.collection('barbers').seed([{ _id: barberId, tenantId: tenantA, name: 'Alex', dailyAvailability: allWeek }]);
    const req: any = new Request('http://localhost/api/t/tenant-a/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Casey', customerEmail: 'casey@example.com', customerPhone: '555-0100',
        serviceId: serviceId.toString(), barberId: barberId.toString(), dateTime: futureSlot().toISOString(), ...overrides,
      }),
    });
    return POST(req, { params: Promise.resolve({ tenantSlug: 'tenant-a' }) });
  }

  it('accepts a booking when service and barber both belong to the resolved tenant', async () => {
    expect((await book()).status).toBe(201);
  });

  it('stores the customer email lower-cased so it matches sign-in, and reuses the record for a different capitalisation', async () => {
    await book({ customerEmail: 'Casey.Cust@Example.COM' });
    expect(await (fakeDb.db as FakeDb).collection('customers').findOne({ email: 'casey.cust@example.com' })).toBeTruthy();
    // second booking, other capitalisation, same person
    const db = fakeDb.db as FakeDb;
    const before = db.collection('customers').docs.length;
    await book({ customerEmail: 'CASEY.CUST@example.com' });
    expect(db.collection('customers').docs.length).toBe(before);
  });

  it('a guest booking creates a customer with NO password (so it cannot be signed into)', async () => {
    await book();
    expect((fakeDb.db as FakeDb).collection('customers').docs[0].passwordHash).toBeUndefined();
  });

  it('rejects an invalid email', async () => {
    expect((await book({ customerEmail: 'not-an-email' })).status).toBe(400);
  });

  it('a booking starts as pending', async () => {
    await book();
    expect((fakeDb.db as FakeDb).collection('appointments').docs[0].status).toBe('pending');
  });
});

describe('POST /api/appointments — staff-facing create (Part 1 audit finding, fixed in Part 2)', () => {
  let tenantA: ObjectId, tenantB: ObjectId;

  beforeEach(() => {
    fakeDb.db = new FakeDb();
    tenantA = new ObjectId();
    tenantB = new ObjectId();
  });

  function sessionCookieFor(db: FakeDb, tenantId: ObjectId) {
    const rawToken = crypto.randomBytes(16).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    db.collection('sessions').seed([
      { tokenHash, subjectId: new ObjectId(), subjectType: 'user', role: 'admin', tenantId, expiresAt: new Date(Date.now() + 60_000) },
    ]);
    return rawToken;
  }

  it('CONFIRMED FIXED: rejects an appointment whose barberId belongs to a different tenant', async () => {
    const { POST } = await import('@/app/api/appointments/route');
    const db = fakeDb.db as FakeDb;

    const foreignBarberId = new ObjectId();
    const foreignServiceId = new ObjectId();
    const foreignCustomerId = new ObjectId();
    db.collection('barbers').seed([{ _id: foreignBarberId, tenantId: tenantB, name: 'Tenant B Barber' }]);
    db.collection('services').seed([{ _id: foreignServiceId, tenantId: tenantB, name: 'Tenant B Service' }]);
    db.collection('customers').seed([{ _id: foreignCustomerId, name: 'X', email: 'x@x.com', phone: '0', loyaltyPoints: {} }]);

    const rawToken = sessionCookieFor(db, tenantA);
    const req: any = new Request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { cookie: `session=${rawToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: foreignCustomerId.toString(),
        barberId: foreignBarberId.toString(), // tenant B's barber
        serviceId: foreignServiceId.toString(), // tenant B's service
        dateTime: new Date().toISOString(),
      }),
    });

    const res = await POST(req);
    // Part 2 added the ownership check (mirrors /api/t/[tenantSlug]/book):
    // barber/service/customer are each looked up scoped to session.tenantId
    // before insertOne, so a cross-tenant reference now 400s instead of
    // silently creating a cross-tenant-referencing appointment.
    expect(res.status).toBe(400);

    const created = await db.collection('appointments').countDocuments({});
    expect(created).toBe(0); // nothing was inserted
  });
});
