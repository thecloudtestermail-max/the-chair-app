// scripts/backfill-tenant-currency.ts
//
// One-off migration. Tenant.currency (lib/currency.ts) is a new required
// field defaulting to ZAR for tenants created going forward — every read
// path already falls back to DEFAULT_CURRENCY when it's missing, so this
// isn't strictly required for the app to work correctly, but it's cheap
// and means a direct DB query or export doesn't need to know about that
// fallback too. Run once after deploying:
//
//   npx tsx scripts/backfill-tenant-currency.ts          (dry run: reports only)
//   npx tsx scripts/backfill-tenant-currency.ts --apply  (writes the changes)
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI env var required');
const apply = process.argv.includes('--apply');
const DEFAULT_CURRENCY = 'ZAR';

async function main() {
  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db('chair-app');

  const missing = await db.collection('tenants').find({ currency: { $exists: false } }).toArray();
  console.log(`${missing.length} tenant(s) missing currency`);
  for (const t of missing) {
    console.log(`  ${apply ? 'setting' : 'would set'} ${t.name} (${t.slug}) → ${DEFAULT_CURRENCY}`);
    if (apply) await db.collection('tenants').updateOne({ _id: t._id }, { $set: { currency: DEFAULT_CURRENCY } });
  }
  if (!apply) console.log('Dry run only. Re-run with --apply to write.');
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
