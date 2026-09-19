// scripts/create-super-admin.ts
// Run ONCE against production before anything else — this is the only way
// to get a working /admin login, since super_admin can't be created through
// the platform API itself (chicken-and-egg: that API requires a super_admin
// session to call).
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chair-app';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
  throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set');
}

async function createSuperAdmin() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('chair-app');

    const existing = await db.collection('users').findOne({
      email: SUPER_ADMIN_EMAIL,
      role: 'super_admin',
    });
    if (existing) {
      console.log(`Super admin "${SUPER_ADMIN_EMAIL}" already exists (${existing._id}). Skipping.`);
      return;
    }

    const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD!, 10);
    const result = await db.collection('users').insertOne({
      // No tenantId — super_admin is platform-wide, not tenant-scoped.
      username: 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      role: 'super_admin',
      createdAt: new Date(),
    });

    console.log(`✅ Created super_admin (${result.insertedId})`);
    console.log(`   Login at /admin/login with: ${SUPER_ADMIN_EMAIL}`);
  } finally {
    await client.close();
  }
}

createSuperAdmin();
