// scripts/init-db.ts
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI env var required');
}

async function initializeDatabase() {
  const client = new MongoClient(MONGODB_URI!);
  
  try {
    await client.connect();
    const db = client.db('chair-app');
    
    // Collections: tenants, users, barbers, services, categories, customers, appointments, siteSettings, sessions
    const collectionNames = [
      'tenants',
      'users',
      'barbers',
      'services',
      'categories',
      'customers',
      'appointments',
      'siteSettings',
      'sessions',
      'loginAttempts',
      'reviews',
      'favorites',
      'customerClaims',
      'customerClaimSessions',
      'staffInvites',
      'posts',
      'likes',
      'comments',
      'follows',
    ];
    
    for (const name of collectionNames) {
      const exists = await db.listCollections({ name }).hasNext();
      if (!exists) {
        await db.createCollection(name);
        console.log(`✓ Created collection: ${name}`);
      } else {
        console.log(`✓ Collection exists: ${name}`);
      }
    }
    
    // Create indexes
    // Sessions: TTL index on expiresAt (required)
    await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true });
    console.log('✓ Created TTL index on sessions.expiresAt and unique index on sessions.tokenHash');
    
    // Login attempts: TTL index for rate limiting
    await db.collection('loginAttempts').createIndex({ createdAt: 1 }, { expireAfterSeconds: 900 }); // 15 minutes
    console.log('✓ Created TTL index on loginAttempts.createdAt');
    
    // Tenants: unique index on slug
    await db.collection('tenants').createIndex({ slug: 1 }, { unique: true });
    console.log('✓ Created unique index on tenants.slug');
    
    // Users: unique per tenant+email (prevents duplicate accounts in the same
    // tenant); role lookups stay non-unique.
    await db.collection('users').createIndex({ tenantId: 1, email: 1 }, { unique: true });
    await db.collection('users').createIndex({ tenantId: 1, role: 1 });
    console.log('✓ Created unique tenant+email index and role index on users');
    
    // Barbers: unique slug per tenant
    await db.collection('barbers').createIndex({ tenantId: 1, slug: 1 }, { unique: true });
    console.log('✓ Created unique index on barbers (tenantId, slug)');
    
    // Services: indexes for tenant + category
    await db.collection('services').createIndex({ tenantId: 1 });
    await db.collection('services').createIndex({ tenantId: 1, categoryId: 1 });
    console.log('✓ Created indexes on services');
    
    // Categories: index for tenant
    await db.collection('categories').createIndex({ tenantId: 1 });
    console.log('✓ Created index on categories');
    
    // Customers: unique email — one customer record per email across the
    // whole platform; tenant-specific data lives in loyaltyPoints.<tenantId>.
    await db.collection('customers').createIndex({ email: 1 }, { unique: true });
    console.log('✓ Created unique index on customers.email');
    
    // Appointments: indexes for tenant + date range queries
    await db.collection('appointments').createIndex({ tenantId: 1, dateTime: 1 });
    await db.collection('appointments').createIndex({ tenantId: 1, customerId: 1 });
    await db.collection('appointments').createIndex({ tenantId: 1, barberId: 1 });
    console.log('✓ Created indexes on appointments');
    
    // SiteSettings: unique index on tenantId (one per tenant)
    await db.collection('siteSettings').createIndex({ tenantId: 1 }, { unique: true });
    console.log('✓ Created unique index on siteSettings.tenantId');
    
    // Reviews: one per appointment (can't review the same visit twice),
    // plus a lookup index for rendering a tenant's/barber's review list.
    await db.collection('reviews').createIndex({ appointmentId: 1 }, { unique: true });
    await db.collection('reviews').createIndex({ tenantId: 1, status: 1 });
    await db.collection('reviews').createIndex({ barberId: 1, status: 1 });
    console.log('✓ Created indexes on reviews');

    // Favorites: one favorite per customer+tenant pair.
    await db.collection('favorites').createIndex({ customerId: 1, tenantId: 1 }, { unique: true });
    console.log('✓ Created unique index on favorites (customerId, tenantId)');

    // Customer claims: TTL so unused one-time codes expire on their own.
    await db.collection('customerClaims').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    console.log('✓ Created TTL index on customerClaims.expiresAt');

    await db.collection('customerClaimSessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection('customerClaimSessions').createIndex({ tokenHash: 1 }, { unique: true });
    console.log('✓ Created indexes on customerClaimSessions');

    // Staff invites: TTL index for auto-expiry, plus the lookup shape
    // acceptStaffInvite() actually queries on (email, codeHash).
    await db.collection('staffInvites').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection('staffInvites').createIndex({ email: 1, codeHash: 1 });
    await db.collection('staffInvites').createIndex({ userId: 1 });
    console.log('✓ Created indexes on staffInvites');

    // Posts: barber-scoped feed + own-posts dashboard list; global feed cursor.
    await db.collection('posts').createIndex({ barberId: 1, createdAt: -1 });
    await db.collection('posts').createIndex({ createdAt: -1 });
    console.log('✓ Created indexes on posts');

    // Likes: one like per customer+post; postId-first so the like-count
    // aggregation (run on every feed render) can use the index prefix.
    await db.collection('likes').createIndex({ postId: 1, customerId: 1 }, { unique: true });
    console.log('✓ Created unique index on likes (postId, customerId)');

    // Comments: list + count by post; tenantId index reserved for a future
    // admin moderation view.
    await db.collection('comments').createIndex({ postId: 1, createdAt: -1 });
    await db.collection('comments').createIndex({ tenantId: 1, createdAt: -1 });
    console.log('✓ Created indexes on comments');

    // Follows: one follow per customer+barber; customerId-first mirrors
    // favorites (primary read is "list who I follow"); secondary barberId
    // index serves the follower-count aggregation on the barber profile page.
    await db.collection('follows').createIndex({ customerId: 1, barberId: 1 }, { unique: true });
    await db.collection('follows').createIndex({ barberId: 1 });
    console.log('✓ Created indexes on follows');

    console.log('\n✓ Database initialization complete!');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

initializeDatabase();
