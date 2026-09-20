// __tests__/account-reset.test.ts
//
// The operator-side reset behind "email support to reset your password".
import { describe, it, expect } from 'vitest';
import { FakeDb } from './helpers/fakeMongo';
import { resetPasswordForEmail } from '@/lib/accountReset';
import { verifyPassword } from '@/lib/auth';
import { seedCustomer, seedCustomerSession, seedStaffSession, seedTenant, seedUser } from './helpers/authFixtures';

describe('resetPasswordForEmail', () => {
  it('gives a customer a new working password and ends their sessions', async () => {
    const db = new FakeDb();
    const c = await seedCustomer(db, { email: 'casey@example.com', password: 'Old-Pass-123' });
    seedCustomerSession(db, c._id);
    const r = await resetPasswordForEmail(db, ' Casey@Example.com ');
    expect(r).toMatchObject({ email: 'casey@example.com', customerAccount: true, staffAccounts: 0 });
    expect(await verifyPassword(r!.password, db.collection('customers').docs[0].passwordHash)).toBe(true);
    expect(await verifyPassword('Old-Pass-123', db.collection('customers').docs[0].passwordHash)).toBe(false);
    expect(db.collection('customerClaimSessions').docs).toHaveLength(0);
  });

  it('resets EVERY account the email owns (staff at two salons + customer) to one temporary password, forcing staff to change it', async () => {
    const db = new FakeDb();
    const a = seedTenant(db, 'a'), b = seedTenant(db, 'b');
    const u1 = await seedUser(db, a._id, { email: 'p@x.com', role: 'barber', password: 'Old-One-123' });
    await seedUser(db, b._id, { email: 'p@x.com', role: 'receptionist', password: 'Old-Two-123' });
    await seedCustomer(db, { email: 'p@x.com', password: 'Old-Cust-123' });
    seedStaffSession(db, { role: 'barber', tenantId: a._id, subjectId: u1._id });

    const r = await resetPasswordForEmail(db, 'p@x.com');
    expect(r).toMatchObject({ staffAccounts: 2, customerAccount: true });
    for (const u of db.collection('users').docs) {
      expect(await verifyPassword(r!.password, u.passwordHash)).toBe(true);
      expect(u.mustChangePassword).toBe(true);
      expect(u.tempPasswordExpiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    }
    expect(db.collection('sessions').docs).toHaveLength(0);
  });

  it('also voids any emailed reset link already outstanding for that address', async () => {
    const db = new FakeDb();
    await seedCustomer(db, { email: 'casey@example.com', password: 'Old-Pass-123' });
    db.collection('passwordResets').seed([{ email: 'casey@example.com', tokenHash: 'x', expiresAt: new Date(Date.now() + 1e6) }]);
    await resetPasswordForEmail(db, 'casey@example.com');
    expect(db.collection('passwordResets').docs).toHaveLength(0);
  });

  it('NEVER resets the platform super_admin, and reports nothing found for an unknown email', async () => {
    const db = new FakeDb();
    const root = await seedUser(db, undefined, { email: 'root@platform.com', role: 'super_admin', password: 'Root-Pass-99' });
    const before = db.collection('users').docs[0].passwordHash;
    expect(await resetPasswordForEmail(db, 'root@platform.com')).toBeNull();
    expect(db.collection('users').docs[0].passwordHash).toBe(before);
    expect(root).toBeTruthy();
    expect(await resetPasswordForEmail(db, 'nobody@x.com')).toBeNull();
    expect(await resetPasswordForEmail(db, '')).toBeNull();
  });
});
