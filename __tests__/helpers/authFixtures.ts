// __tests__/helpers/authFixtures.ts
//
// Shared setup for the auth-flow route tests: seeded salons, staff and
// customers with real (low-cost) bcrypt hashes, raw session cookies, and a
// tiny JSON request builder. Keeps each test about the behaviour, not the plumbing.
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { FakeDb } from './fakeMongo';
import { nextRequest } from './nextRequest';

export const sha = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');
export const hashPw = (pw: string) => bcrypt.hash(pw, 4);

export function jsonReq(path: string, body?: unknown, o: { method?: string; cookie?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.ip) headers['x-forwarded-for'] = o.ip;
  return nextRequest(`http://localhost${path}`, {
    method: o.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** "session=...; customerClaim=..." for whichever cookies a response set. */
export function cookiesOf(res: any): string {
  return ['session', 'customerClaim']
    .map((n) => (res.cookies.get(n)?.value ? `${n}=${res.cookies.get(n).value}` : null))
    .filter(Boolean)
    .join('; ');
}

export function seedTenant(db: FakeDb, slug = 'demo', status: 'active' | 'suspended' = 'active', name = 'Demo Salon') {
  const t = { _id: new ObjectId(), slug, name, status };
  db.collection('tenants').seed([...db.collection('tenants').docs, t]);
  return t;
}

export async function seedUser(
  db: FakeDb,
  tenantId: ObjectId | undefined,
  o: { email: string; role: string; password: string; username?: string; mustChangePassword?: boolean; tempPasswordExpiresAt?: Date; barberId?: ObjectId; passwordHash?: string }
) {
  const u = {
    _id: new ObjectId(),
    tenantId,
    email: o.email,
    username: o.username ?? o.email.split('@')[0],
    role: o.role,
    passwordHash: o.passwordHash ?? (await hashPw(o.password)),
    mustChangePassword: o.mustChangePassword,
    tempPasswordExpiresAt: o.tempPasswordExpiresAt,
    barberId: o.barberId,
  };
  db.collection('users').seed([...db.collection('users').docs, u]);
  return u;
}

export async function seedCustomer(db: FakeDb, o: { email: string; password?: string; name?: string; phone?: string }) {
  const c: any = { _id: new ObjectId(), name: o.name ?? 'Jamie Customer', email: o.email, phone: o.phone ?? '555 010 0100', loyaltyPoints: {} };
  if (o.password) c.passwordHash = await hashPw(o.password);
  db.collection('customers').seed([...db.collection('customers').docs, c]);
  return c;
}

/** Inserts a staff session directly and returns the cookie header for it. */
export function seedStaffSession(db: FakeDb, o: { role: string; tenantId?: ObjectId; subjectId?: ObjectId; barberId?: ObjectId; mustChangePassword?: boolean }) {
  const raw = crypto.randomBytes(16).toString('hex');
  db.collection('sessions').seed([
    ...db.collection('sessions').docs,
    { tokenHash: sha(raw), subjectId: o.subjectId ?? new ObjectId(), subjectType: 'user', role: o.role, tenantId: o.tenantId, barberId: o.barberId, mustChangePassword: o.mustChangePassword, expiresAt: new Date(Date.now() + 60_000) },
  ]);
  return `session=${raw}`;
}

export function seedCustomerSession(db: FakeDb, customerId: ObjectId) {
  const raw = crypto.randomBytes(16).toString('hex');
  db.collection('customerClaimSessions').seed([
    ...db.collection('customerClaimSessions').docs,
    { tokenHash: sha(raw), customerId, expiresAt: new Date(Date.now() + 60_000) },
  ]);
  return `customerClaim=${raw}`;
}
