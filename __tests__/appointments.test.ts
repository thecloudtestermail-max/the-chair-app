// __tests__/appointments.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { FakeDb } from './helpers/fakeMongo';
import { nextRequest } from './helpers/nextRequest';

const fakeDb = vi.hoisted(() => ({ db: null as any }));

vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));

function hash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function staffToken(db: FakeDb, role: string, tenantId: ObjectId, subjectId = new ObjectId()) {
  const rawToken = crypto.randomBytes(16).toString('hex');
  db.collection('sessions').seed([
    ...db.collection('sessions').docs,
    { tokenHash: hash(rawToken), subjectId, subjectType: 'user', role, tenantId, expiresAt: new Date(Date.now() + 60_000) },
  ]);
  return rawToken;
}

function req(method: string, rawToken?: string, body?: any) {
  return nextRequest('http://localhost/api/appointments', {
    method,
    headers: { ...(rawToken ? { cookie: `session=${rawToken}` } : {}), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/appointments', () => {
  it('populates barber/service/customer names and only returns the caller\'s tenant', async () => {
    const { GET } = await import('@/app/api/appointments/route');
    const db = (fakeDb.db = new FakeDb());
    const tenantA = new ObjectId();
    const tenantB = new ObjectId();
    const barberId = new ObjectId();
    const serviceId = new ObjectId();
    const customerId = new ObjectId();
    db.collection('barbers').seed([{ _id: barberId, tenantId: tenantA, name: 'Alex' }]);
    db.collection('services').seed([{ _id: serviceId, tenantId: tenantA, name: 'Fade', price: 25, duration: 30 }]);
    db.collection('customers').seed([{ _id: customerId, name: 'Jamie', phone: '555-0100' }]);
    db.collection('appointments').seed([
      { _id: new ObjectId(), tenantId: tenantA, barberId, serviceId, customerId, dateTime: new Date(), status: 'pending' },
      { _id: new ObjectId(), tenantId: tenantB, barberId, serviceId, customerId, dateTime: new Date(), status: 'pending' },
    ]);

    // A receptionist sees the whole salon. (A barber session with no linked
    // profile deliberately sees nothing; a barber with one sees only their own.)
    const rawToken = staffToken(db, 'receptionist', tenantA);
    const res = await GET(req('GET', rawToken));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].barberName).toBe('Alex');
    expect(body[0].serviceName).toBe('Fade');
    expect(body[0].customerName).toBe('Jamie');
  });
});

describe('GET /api/appointments — barber scoping', () => {
  it('a barber sees only their own bookings; one with no linked profile sees none', async () => {
    const { GET } = await import('@/app/api/appointments/route');
    const db = (fakeDb.db = new FakeDb());
    const tenantId = new ObjectId(), mine = new ObjectId(), theirs = new ObjectId(), serviceId = new ObjectId(), customerId = new ObjectId();
    db.collection('barbers').seed([{ _id: mine, tenantId, name: 'Me' }, { _id: theirs, tenantId, name: 'Them' }]);
    db.collection('services').seed([{ _id: serviceId, tenantId, name: 'Fade', price: 25, duration: 30 }]);
    db.collection('customers').seed([{ _id: customerId, name: 'Jamie' }]);
    const base = { tenantId, serviceId, customerId, dateTime: new Date(), status: 'pending' };
    db.collection('appointments').seed([{ _id: new ObjectId(), barberId: mine, ...base }, { _id: new ObjectId(), barberId: theirs, ...base }]);

    const withProfile = crypto.randomBytes(16).toString('hex');
    const noProfile = crypto.randomBytes(16).toString('hex');
    db.collection('sessions').seed([
      { tokenHash: hash(withProfile), subjectId: new ObjectId(), subjectType: 'user', role: 'barber', tenantId, barberId: mine, expiresAt: new Date(Date.now() + 60_000) },
      { tokenHash: hash(noProfile), subjectId: new ObjectId(), subjectType: 'user', role: 'barber', tenantId, expiresAt: new Date(Date.now() + 60_000) },
    ]);
    const own = await (await GET(req('GET', withProfile))).json();
    expect(own).toHaveLength(1);
    expect(own[0].barberName).toBe('Me');
    expect(await (await GET(req('GET', noProfile))).json()).toEqual([]);
  });
});

describe('POST /api/appointments', () => {
  let tenantA: ObjectId, barberId: ObjectId, serviceId: ObjectId, customerId: ObjectId;
  function seedCore(db: FakeDb) {
    db.collection('barbers').seed([{ _id: barberId, tenantId: tenantA, name: 'Alex' }]);
    db.collection('services').seed([{ _id: serviceId, tenantId: tenantA, name: 'Fade', price: 25, duration: 30 }]);
    db.collection('customers').seed([{ _id: customerId, name: 'Jamie', loyaltyPoints: { [tenantA.toString()]: 0 } }]);
  }

  it('barber role cannot create a walk-in (admin/receptionist only)', async () => {
    const db = (fakeDb.db = new FakeDb());
    tenantA = new ObjectId(); barberId = new ObjectId(); serviceId = new ObjectId(); customerId = new ObjectId();
    seedCore(db);
    const { POST } = await import('@/app/api/appointments/route');
    const rawToken = staffToken(db, 'barber', tenantA);
    const res = await POST(req('POST', rawToken, { customerId: customerId.toString(), barberId: barberId.toString(), serviceId: serviceId.toString(), dateTime: new Date().toISOString() }));
    expect(res.status).toBe(401);
  });

  it('rejects a barberId belonging to a different tenant', async () => {
    const db = (fakeDb.db = new FakeDb());
    tenantA = new ObjectId(); serviceId = new ObjectId(); customerId = new ObjectId();
    const foreignBarberId = new ObjectId();
    db.collection('barbers').seed([{ _id: foreignBarberId, tenantId: new ObjectId(), name: 'Foreign' }]); // different tenant
    db.collection('services').seed([{ _id: serviceId, tenantId: tenantA, name: 'Fade', price: 25, duration: 30 }]);
    db.collection('customers').seed([{ _id: customerId, loyaltyPoints: { [tenantA.toString()]: 0 } }]);

    const { POST } = await import('@/app/api/appointments/route');
    const rawToken = staffToken(db, 'receptionist', tenantA);
    const res = await POST(req('POST', rawToken, { customerId: customerId.toString(), barberId: foreignBarberId.toString(), serviceId: serviceId.toString(), dateTime: new Date().toISOString() }));
    expect(res.status).toBe(400);
  });

  it('rejects a customer with no loyalty relationship to this tenant', async () => {
    const db = (fakeDb.db = new FakeDb());
    tenantA = new ObjectId(); barberId = new ObjectId(); serviceId = new ObjectId();
    const strangerCustomer = new ObjectId();
    db.collection('barbers').seed([{ _id: barberId, tenantId: tenantA, name: 'Alex' }]);
    db.collection('services').seed([{ _id: serviceId, tenantId: tenantA, name: 'Fade', price: 25, duration: 30 }]);
    db.collection('customers').seed([{ _id: strangerCustomer, loyaltyPoints: {} }]); // no entry for tenantA

    const { POST } = await import('@/app/api/appointments/route');
    const rawToken = staffToken(db, 'receptionist', tenantA);
    const res = await POST(req('POST', rawToken, { customerId: strangerCustomer.toString(), barberId: barberId.toString(), serviceId: serviceId.toString(), dateTime: new Date().toISOString() }));
    expect(res.status).toBe(400);
  });

  it('a walk-in with status:"waitlist" does not require a dateTime', async () => {
    const db = (fakeDb.db = new FakeDb());
    tenantA = new ObjectId(); barberId = new ObjectId(); serviceId = new ObjectId(); customerId = new ObjectId();
    seedCore(db);
    const { POST } = await import('@/app/api/appointments/route');
    const rawToken = staffToken(db, 'receptionist', tenantA);
    const res = await POST(req('POST', rawToken, { customerId: customerId.toString(), barberId: barberId.toString(), serviceId: serviceId.toString(), status: 'waitlist' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('waitlist');
  });

  it('records a "created" log entry attributed to the acting staff member', async () => {
    const db = (fakeDb.db = new FakeDb());
    tenantA = new ObjectId(); barberId = new ObjectId(); serviceId = new ObjectId(); customerId = new ObjectId();
    seedCore(db);
    const staffSubjectId = new ObjectId();
    const { POST } = await import('@/app/api/appointments/route');
    const rawToken = staffToken(db, 'receptionist', tenantA, staffSubjectId);
    const res = await POST(req('POST', rawToken, { customerId: customerId.toString(), barberId: barberId.toString(), serviceId: serviceId.toString(), dateTime: new Date().toISOString() }));
    const body = await res.json();
    expect(body.log[0].action).toBe('created');
    expect(body.log[0].changedBy).toBe(`receptionist:${staffSubjectId.toString()}`);
  });
});

describe('PUT /api/appointments — barbers, loyalty points, and status emails', () => {
  let tenantId: ObjectId, barberId: ObjectId, otherBarberId: ObjectId, serviceId: ObjectId, customerId: ObjectId, mineId: ObjectId, theirsId: ObjectId;

  function seedAll(db: FakeDb, price = 45.5) {
    tenantId = new ObjectId(); barberId = new ObjectId(); otherBarberId = new ObjectId(); serviceId = new ObjectId(); customerId = new ObjectId();
    mineId = new ObjectId(); theirsId = new ObjectId();
    db.collection('tenants').seed([{ _id: tenantId, slug: 'demo', name: 'Demo Salon', status: 'active' }]);
    db.collection('barbers').seed([{ _id: barberId, tenantId, name: 'Marcus' }, { _id: otherBarberId, tenantId, name: 'Other' }]);
    db.collection('services').seed([{ _id: serviceId, tenantId, name: 'Retwist', price, duration: 60 }]);
    db.collection('customers').seed([{ _id: customerId, name: 'Jamie', email: 'jamie@example.test', loyaltyPoints: { [tenantId.toString()]: 10 } }]);
    const base = { tenantId, customerId, serviceId, dateTime: new Date(), status: 'confirmed', log: [] };
    db.collection('appointments').seed([{ _id: mineId, barberId, ...base }, { _id: theirsId, barberId: otherBarberId, ...base }]);
  }
  const barberToken = (db: FakeDb, withProfile = true) => {
    const rawToken = crypto.randomBytes(16).toString('hex');
    db.collection('sessions').seed([...db.collection('sessions').docs, { tokenHash: hash(rawToken), subjectId: new ObjectId(), subjectType: 'user', role: 'barber', tenantId, barberId: withProfile ? barberId : undefined, expiresAt: new Date(Date.now() + 60_000) }]);
    return rawToken;
  };
  const put = async (rawToken: string, id: ObjectId, body: any) => {
    const { PUT } = await import('@/app/api/appointments/route');
    return PUT(req('PUT', rawToken, { _id: id.toString(), ...body }));
  };
  const points = (db: FakeDb) => db.collection('customers').docs[0].loyaltyPoints[tenantId.toString()];

  it('a barber can confirm, complete or cancel THEIR OWN booking', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db);
    const t = barberToken(db);
    for (const status of ['confirmed', 'completed', 'cancelled']) expect((await put(t, mineId, { status })).status).toBe(200);
  });

  it('a barber cannot touch another barber\'s booking (404, not 403: it is invisible to them)', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db);
    expect((await put(barberToken(db), theirsId, { status: 'completed' })).status).toBe(404);
    expect(db.collection('appointments').docs.find((a) => a._id === theirsId)!.status).toBe('confirmed');
  });

  it('a barber cannot reopen a booking to pending or move it to the waitlist', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db);
    const t = barberToken(db);
    expect((await put(t, mineId, { status: 'pending' })).status).toBe(403);
    expect((await put(t, mineId, { status: 'waitlist' })).status).toBe(403);
  });

  it('a barber account with no linked profile can act on nothing', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db);
    expect((await put(barberToken(db, false), mineId, { status: 'completed' })).status).toBe(404);
  });

  it('receptionists and admins can change any booking in their salon, but not another salon\'s', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db);
    expect((await put(staffToken(db, 'receptionist', tenantId), theirsId, { status: 'confirmed' })).status).toBe(200);
    expect((await put(staffToken(db, 'admin', new ObjectId()), mineId, { status: 'cancelled' })).status).toBe(404);
  });

  it('completing a visit credits 1 point per whole dollar (45.50 -> 45), once', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db);
    const t = barberToken(db);
    await put(t, mineId, { status: 'completed' });
    expect(points(db)).toBe(10 + 45);
    await put(t, mineId, { status: 'completed' }); // saved again
    expect(points(db)).toBe(55);
    await put(t, mineId, { status: 'cancelled' });
    await put(t, mineId, { status: 'completed' }); // toggled back
    expect(points(db)).toBe(55);
    expect(db.collection('appointments').docs.find((a) => a._id === mineId)!.loyaltyAwarded).toBe(true);
  });

  it('starts the counter for a customer who has no entry for this salon yet', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db);
    db.collection('customers').docs[0].loyaltyPoints = {};
    await put(staffToken(db, 'admin', tenantId), mineId, { status: 'completed' });
    expect(points(db)).toBe(45);
  });

  it('other statuses award nothing, and a free service awards nothing', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db, 0);
    const t = barberToken(db);
    await put(t, mineId, { status: 'confirmed' });
    await put(t, mineId, { status: 'completed' });
    expect(points(db)).toBe(10);
  });

  it('logs who changed the status', async () => {
    const db = (fakeDb.db = new FakeDb()); seedAll(db);
    await put(barberToken(db), mineId, { status: 'completed' });
    const log = db.collection('appointments').docs.find((a) => a._id === mineId)!.log;
    expect(log[0].action).toBe('status changed to completed');
    expect(log[0].changedBy).toMatch(/^barber:/);
  });

  describe('customer emails', () => {
    const configure = () => {
      for (const k of ['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY']) vi.stubEnv(k, 'x');
      const sent: any[] = [];
      vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => 'OK' }; }));
      return sent;
    };
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

    it('confirming or cancelling emails the customer once per real change', async () => {
      const db = (fakeDb.db = new FakeDb()); seedAll(db);
      db.collection('appointments').docs.find((a) => a._id === mineId)!.status = 'pending';
      const sent = configure();
      const t = barberToken(db);
      await put(t, mineId, { status: 'confirmed' });
      await put(t, mineId, { status: 'confirmed' }); // no change: no second email
      await put(t, mineId, { status: 'cancelled' });
      expect(sent).toHaveLength(2);
      expect(JSON.stringify(sent[0])).toContain('confirmed');
      expect(JSON.stringify(sent[0])).toContain('jamie@example.test');
      expect(JSON.stringify(sent[1])).toContain('cancelled');
    });

    it('completing does not email, and a mail failure never breaks the status change', async () => {
      const db = (fakeDb.db = new FakeDb()); seedAll(db);
      const sent = configure();
      expect((await put(barberToken(db), mineId, { status: 'completed' })).status).toBe(200);
      expect(sent).toHaveLength(0);
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
      expect((await put(barberToken(db), mineId, { status: 'cancelled' })).status).toBe(200);
    });
  });
});
