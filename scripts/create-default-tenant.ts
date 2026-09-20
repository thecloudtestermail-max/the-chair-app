// scripts/create-default-tenant.ts
// Run BEFORE migrate-from-sanity.ts — creates the tenant + first admin
// that all migrated Sanity data will be attached to.
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chair-app';
const TENANT_SLUG = process.env.MIGRATION_TENANT_SLUG || 'default';
const TENANT_NAME = process.env.MIGRATION_TENANT_NAME || 'The Chair App';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
}

async function createDefaultTenant() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('chair-app');

    const existing = await db.collection('tenants').findOne({ slug: TENANT_SLUG });
    if (existing) {
      console.log(`Tenant "${TENANT_SLUG}" already exists (${existing._id}). Skipping creation.`);
      return;
    }

    const tenantResult = await db.collection('tenants').insertOne({
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      branding: { primaryColor: '#2563eb' },
      contactEmail: ADMIN_EMAIL,
      status: 'active',
      createdAt: new Date(),
    });

    const tenantId = tenantResult.insertedId;

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD!, 10);
    await db.collection('users').insertOne({
      tenantId,
      username: 'Admin',
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
      createdAt: new Date(),
    });

    await db.collection('siteSettings').insertOne({
      tenantId,
      title: TENANT_NAME,
      description: `Welcome to ${TENANT_NAME}`,
      phone: '',
      email: ADMIN_EMAIL,
      socialLinks: [],
    });

    // Every tenant gets a default barber representing the shop itself —
    // whether it's a solo operator, a barbershop, or a salon, this gives
    // the establishment something to post/book/appear-on-the-map as from
    // day one, without forcing the admin to name individual staff first.
    await db.collection('barbers').insertOne({
      tenantId,
      name: TENANT_NAME,
      slug: 'shop',
      dailyAvailability: [],
    });

    console.log(`✅ Created tenant "${TENANT_SLUG}" (${tenantId})`);
    console.log(`   Admin login: ${ADMIN_EMAIL}`);
  } finally {
    await client.close();
  }
}

createDefaultTenant();
