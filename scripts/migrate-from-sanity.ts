// scripts/migrate-from-sanity.ts
import { MongoClient } from 'mongodb';
import { createClient } from 'next-sanity';
import { put } from '@vercel/blob';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chair-app';
const SANITY_PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const SANITY_READ_TOKEN = process.env.SANITY_API_READ_TOKEN;
// Audit fix: @vercel/blob's put() reads process.env.BLOB_READ_WRITE_TOKEN by
// default (or an explicit `token` option) — it never read the old
// VERCEL_BLOB_TOKEN name, so image re-upload silently had no credential
// unless BLOB_READ_WRITE_TOKEN also happened to be set. Renamed to match,
// and passed explicitly below rather than relying on the ambient env var.
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!SANITY_PROJECT_ID || !SANITY_READ_TOKEN || !BLOB_READ_WRITE_TOKEN) {
  throw new Error('Missing required env vars for migration');
}

const sanityClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: '2023-05-03',
  useCdn: false,
  token: SANITY_READ_TOKEN,
});

async function migrateData() {
  const mongoClient = new MongoClient(MONGODB_URI);
  
  try {
    await mongoClient.connect();
    const db = mongoClient.db('chair-app');
    
    // In-memory lookup tables for reference remapping
    const categoryMap = new Map();
    const barberMap = new Map();
    const serviceMap = new Map();
    const customerMap = new Map();
    
    // Assume single tenant for this migration
    const defaultTenant = await db.collection('tenants').findOne({ slug: 'default' });
    if (!defaultTenant) throw new Error('Default tenant not found — run init-db.ts first');
    
    const tenantId = defaultTenant._id;
    
    console.log('📍 Starting migration...\n');
    
    // 1. Migrate categories
    console.log('📁 Migrating categories...');
    const sanityCategories = await sanityClient.fetch(`*[_type == "category"]`);
    for (const cat of sanityCategories) {
      const result = await db.collection('categories').insertOne({
        tenantId,
        name: cat.name,
      });
      categoryMap.set(cat._id, result.insertedId);
    }
    console.log(`   ✓ ${sanityCategories.length} categories migrated\n`);
    
    // 2. Migrate barbers
    console.log('💈 Migrating barbers...');
    const sanityBarbers = await sanityClient.fetch(`*[_type == "barber"]`);
    for (const barber of sanityBarbers) {
      let imageUrl = barber.image?.asset?.url || undefined;
      
      // Re-upload image to Vercel Blob if it exists
      if (imageUrl && imageUrl.includes('cdn.sanity.io')) {
        try {
          const response = await fetch(imageUrl);
          if (response.ok && response.body) {
            const blob = await put(`barber-${barber._id}`, response.body, { access: 'public', token: BLOB_READ_WRITE_TOKEN });
            imageUrl = blob.url;
          }
        } catch (e) {
          console.warn(`   ⚠ Failed to migrate image for ${barber.name}`);
        }
      }
      
      const result = await db.collection('barbers').insertOne({
        tenantId,
        name: barber.name,
        slug: barber.slug?.current || barber.name.toLowerCase(),
        bio: barber.bio,
        imageUrl,
        dailyAvailability: barber.dailyAvailability || [],
      });
      barberMap.set(barber._id, result.insertedId);
    }
    console.log(`   ✓ ${sanityBarbers.length} barbers migrated\n`);
    
    // 3. Migrate services
    console.log('✂️  Migrating services...');
    const sanityServices = await sanityClient.fetch(`*[_type == "service"]`);
    for (const svc of sanityServices) {
      let imageUrl = svc.image?.asset?.url || undefined;
      
      if (imageUrl && imageUrl.includes('cdn.sanity.io')) {
        try {
          const response = await fetch(imageUrl);
          if (response.ok && response.body) {
            const blob = await put(`service-${svc._id}`, response.body, { access: 'public', token: BLOB_READ_WRITE_TOKEN });
            imageUrl = blob.url;
          }
        } catch (e) {
          console.warn(`   ⚠ Failed to migrate image for ${svc.name}`);
        }
      }
      
      const result = await db.collection('services').insertOne({
        tenantId,
        name: svc.name,
        duration: svc.duration,
        price: svc.price,
        description: svc.description,
        imageUrl,
        categoryId: svc.category?._ref ? categoryMap.get(svc.category._ref) : undefined,
      });
      serviceMap.set(svc._id, result.insertedId);
    }
    console.log(`   ✓ ${sanityServices.length} services migrated\n`);
    
    // 4. Migrate customers
    console.log('👥 Migrating customers...');
    const sanityCustomers = await sanityClient.fetch(`*[_type == "customer"]`);
    let dedupedCustomers = 0;
    for (const cust of sanityCustomers) {
      // customers.email now has a unique index (see init-db.ts) — find-or-create
      // rather than blind insertOne, since Sanity data may have duplicate emails
      // or this script may be re-run.
      const existing = await db.collection('customers').findOne({ email: cust.email });
      if (existing) {
        await db.collection('customers').updateOne(
          { _id: existing._id },
          { $set: { [`loyaltyPoints.${tenantId.toString()}`]: cust.loyaltyPoints || 0 } }
        );
        customerMap.set(cust._id, existing._id);
        dedupedCustomers++;
        continue;
      }
      const result = await db.collection('customers').insertOne({
        name: cust.name,
        email: cust.email,
        phone: cust.phone,
        loyaltyPoints: {
          [tenantId.toString()]: cust.loyaltyPoints || 0,
        },
        createdAt: new Date(cust._createdAt),
      });
      customerMap.set(cust._id, result.insertedId);
    }
    console.log(`   ✓ ${sanityCustomers.length} customers processed` +
      (dedupedCustomers > 0 ? ` (${dedupedCustomers} matched an existing email, merged loyalty entry)\n` : '\n'));
    
    // 5. Migrate appointments
    console.log('📅 Migrating appointments...');
    const sanityAppointments = await sanityClient.fetch(`*[_type == "appointment"]`);
    let skippedAppointments = 0;
    for (const apt of sanityAppointments) {
      const customerId = customerMap.get(apt.customer?._ref);
      const barberId = barberMap.get(apt.barber?._ref);
      const serviceId = serviceMap.get(apt.service?._ref);

      if (!customerId || !barberId || !serviceId) {
        console.warn(
          `   ⚠ Skipping appointment ${apt._id} — dangling reference ` +
          `(customer: ${apt.customer?._ref ?? 'none'} → ${customerId ?? 'MISSING'}, ` +
          `barber: ${apt.barber?._ref ?? 'none'} → ${barberId ?? 'MISSING'}, ` +
          `service: ${apt.service?._ref ?? 'none'} → ${serviceId ?? 'MISSING'})`
        );
        skippedAppointments++;
        continue;
      }

      const log = [
        {
          timestamp: new Date(apt._createdAt),
          action: 'created',
          changedBy: 'migration',
        },
      ];
      
      if (apt.log?.length) {
        for (const entry of apt.log) {
          log.push({
            timestamp: new Date(entry.timestamp),
            action: entry.action,
            changedBy: entry.changedBy || 'system',
          });
        }
      }
      
      await db.collection('appointments').insertOne({
        tenantId,
        customerId,
        barberId,
        serviceId,
        dateTime: new Date(apt.dateTime),
        status: apt.status || 'pending',
        notes: apt.notes,
        log,
      });
    }
    console.log(`   ✓ ${sanityAppointments.length - skippedAppointments} appointments migrated` +
      (skippedAppointments > 0 ? `, ${skippedAppointments} skipped (dangling references — see warnings above)\n` : '\n'));
    
    console.log('✅ Migration complete!\n');
    console.log('Summary:');
    console.log(`  - Categories: ${sanityCategories.length}`);
    console.log(`  - Barbers: ${sanityBarbers.length}`);
    console.log(`  - Services: ${sanityServices.length}`);
    console.log(`  - Customers: ${sanityCustomers.length}`);
    console.log(`  - Appointments: ${sanityAppointments.length - skippedAppointments} migrated, ${skippedAppointments} skipped`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoClient.close();
  }
}

migrateData();
