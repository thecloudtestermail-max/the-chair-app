// scripts/seed-e2e.ts
//
// Seeds a fresh MongoDB (pointed to by MONGODB_URI) with a complete, known
// fixture for the Playwright E2E suite (e2e/*.spec.ts). Run once per test
// run, against a disposable database — e2e/global-setup.ts calls this
// after starting mongodb-memory-server and before the Next server comes
// up, and again isn't needed per-test since each spec file books/edits
// its own fresh data on top of this base fixture.
//
// NOT meant for production or local dev seeding — see
// scripts/create-default-tenant.ts / scripts/create-super-admin.ts for
// that. This script assumes an EMPTY database and does not check for
// existing documents the way those two do.
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI env var required');

export const E2E_FIXTURE = {
  tenantSlug: 'demo-salon',
  tenantName: 'Demo Salon',
  adminEmail: 'admin@demo-salon.test',
  adminPassword: 'AdminPass123!',
  receptionistEmail: 'reception@demo-salon.test',
  receptionistPassword: 'ReceptionPass123!',
  superAdminEmail: 'super@chairapp.test',
  superAdminPassword: 'SuperPass123!',
  barberName: 'Alex Rivera',
  serviceName: 'Classic Haircut',
  servicePrice: 30,
  serviceDuration: 30,
  reviewCustomerEmail: 'returning-customer@example.test',
  reviewCustomerName: 'Jamie Returning',
  reviewCustomerPassword: 'CustomerPass123!',
};

export async function seed() {
  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db('chair-app');

  // --- Indexes (mirrors scripts/init-db.ts, kept in sync manually — see
  // that file's comments for why each one exists) ---
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection('loginAttempts').createIndex({ createdAt: 1 }, { expireAfterSeconds: 900 });
  await db.collection('tenants').createIndex({ slug: 1 }, { unique: true });
  await db.collection('users').createIndex({ tenantId: 1, email: 1 }, { unique: true });
  await db.collection('users').createIndex({ email: 1 });
  await db.collection('barbers').createIndex({ tenantId: 1, slug: 1 }, { unique: true });
  await db.collection('customers').createIndex({ email: 1 }, { unique: true });
  await db.collection('reviews').createIndex({ appointmentId: 1 }, { unique: true });
  await db.collection('favorites').createIndex({ customerId: 1, tenantId: 1 }, { unique: true });
  await db.collection('customerClaimSessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('customerClaimSessions').createIndex({ tokenHash: 1 }, { unique: true });

  // --- Platform super_admin (admin/login journey) ---
  await db.collection('users').insertOne({
    username: 'E2E Super Admin',
    email: E2E_FIXTURE.superAdminEmail,
    passwordHash: await bcrypt.hash(E2E_FIXTURE.superAdminPassword, 10),
    role: 'super_admin',
    createdAt: new Date(),
  });

  // --- Tenant + staff (dashboard journeys) ---
  const tenantResult = await db.collection('tenants').insertOne({
    slug: E2E_FIXTURE.tenantSlug,
    name: E2E_FIXTURE.tenantName,
    branding: { primaryColor: '#b8873b', secondaryColor: '#96692a', font: 'modern' },
    currency: 'ZAR',
    contactEmail: E2E_FIXTURE.adminEmail,
    status: 'active',
    createdAt: new Date(),
  });
  const tenantId = tenantResult.insertedId;

  await db.collection('siteSettings').insertOne({
    tenantId,
    title: E2E_FIXTURE.tenantName,
    description: 'A demo salon seeded for end-to-end tests.',
    phone: '555-0100',
    email: E2E_FIXTURE.adminEmail,
    location: { address: '1 Test St, Testville', lat: 40.7128, lng: -74.006 },
    socialLinks: [],
  });

  await db.collection('users').insertOne({
    tenantId,
    username: 'Demo Admin',
    email: E2E_FIXTURE.adminEmail,
    passwordHash: await bcrypt.hash(E2E_FIXTURE.adminPassword, 10),
    role: 'admin',
    createdAt: new Date(),
  });

  await db.collection('users').insertOne({
    tenantId,
    username: 'Demo Receptionist',
    email: E2E_FIXTURE.receptionistEmail,
    passwordHash: await bcrypt.hash(E2E_FIXTURE.receptionistPassword, 10),
    role: 'receptionist',
    createdAt: new Date(),
  });

  // Open every day, all day — booking-flow tests must not be sensitive to
  // which calendar day/time the suite happens to run at.
  const allDayEveryDay = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '00:00', endTime: '23:59' }));

  const barberResult = await db.collection('barbers').insertOne({
    tenantId,
    name: E2E_FIXTURE.barberName,
    slug: 'alex-rivera',
    bio: 'Fades, tapers, and classic cuts.',
    tags: ['Fades', 'Classic cuts'],
    dailyAvailability: allDayEveryDay,
  });
  const barberId = barberResult.insertedId;

  const categoryResult = await db.collection('categories').insertOne({ tenantId, name: 'Haircuts' });

  const serviceResult = await db.collection('services').insertOne({
    tenantId,
    categoryId: categoryResult.insertedId,
    name: E2E_FIXTURE.serviceName,
    duration: E2E_FIXTURE.serviceDuration,
    price: E2E_FIXTURE.servicePrice,
    description: 'A classic haircut, seeded for E2E.',
  });
  const serviceId = serviceResult.insertedId;

  // --- A returning customer with one COMPLETED appointment, for the
  // customer-sign-in + review-submission journey (reviews can only be
  // left against a completed appointment — see api/reviews/route.ts). ---
  const customerResult = await db.collection('customers').insertOne({
    name: E2E_FIXTURE.reviewCustomerName,
    email: E2E_FIXTURE.reviewCustomerEmail,
    phone: '555-0199',
    passwordHash: await bcrypt.hash(E2E_FIXTURE.reviewCustomerPassword, 10),
    loyaltyPoints: { [tenantId.toString()]: 10 },
    createdAt: new Date(),
  });
  const customerId = customerResult.insertedId;

  const pastDateTime = new Date();
  pastDateTime.setDate(pastDateTime.getDate() - 7);

  await db.collection('appointments').insertOne({
    tenantId,
    customerId,
    barberId,
    serviceId,
    dateTime: pastDateTime,
    status: 'completed',
    log: [{ timestamp: pastDateTime, action: 'created', changedBy: 'customer' }, { timestamp: new Date(), action: 'status:completed', changedBy: 'staff' }],
  });

  console.log('✅ E2E fixture seeded:');
  console.log(`   tenant: /t/${E2E_FIXTURE.tenantSlug} (${tenantId})`);
  console.log(`   staff admin: ${E2E_FIXTURE.adminEmail} / ${E2E_FIXTURE.adminPassword}`);
  console.log(`   staff receptionist: ${E2E_FIXTURE.receptionistEmail} / ${E2E_FIXTURE.receptionistPassword}`);
  console.log(`   super_admin: ${E2E_FIXTURE.superAdminEmail} / ${E2E_FIXTURE.superAdminPassword}`);
  console.log(`   barber: ${E2E_FIXTURE.barberName} (${barberId}), service: ${E2E_FIXTURE.serviceName} (${serviceId})`);
  console.log(`   returning customer with a completed appointment: ${E2E_FIXTURE.reviewCustomerEmail} / ${E2E_FIXTURE.reviewCustomerPassword}`);

  await client.close();
}

// Only auto-run when executed directly (`tsx scripts/seed-e2e.ts`) — the
// E2E_FIXTURE export above is also imported directly by e2e/*.spec.ts
// files that need the known credentials/names without re-running this.
if (require.main === module) {
  seed().catch((err) => {
    console.error('E2E seed failed:', err);
    process.exit(1);
  });
}
