// scripts/normalize-emails.ts
//
// One-off migration. Sign-in, registration and booking now treat emails as
// case-insensitive by storing and looking them up lower-cased. Accounts
// created before that may have capital letters, which would no longer be
// found at sign-in. Run once after deploying:
//
//   npx tsx scripts/normalize-emails.ts          (dry run: reports only)
//   npx tsx scripts/normalize-emails.ts --apply  (writes the changes)
//
// Two records that differ only by case would collide on the unique email
// index. Those are reported and left untouched so a person can decide which
// to keep.
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI env var required');
const apply = process.argv.includes('--apply');

async function main() {
  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db('chair-app');

  for (const [name, keyOf] of [
    ['users', (d: any) => `${d.tenantId ?? 'platform'}|${String(d.email).toLowerCase()}`],
    ['customers', (d: any) => String(d.email).toLowerCase()],
  ] as const) {
    const docs = await db.collection(name).find({ email: { $type: 'string' } }).toArray();
    const counts = new Map<string, number>();
    for (const d of docs) counts.set(keyOf(d), (counts.get(keyOf(d)) ?? 0) + 1);
    let changed = 0, skipped = 0;
    for (const d of docs) {
      const lower = String(d.email).trim().toLowerCase();
      if (lower === d.email) continue;
      if ((counts.get(keyOf(d)) ?? 0) > 1) { skipped++; console.warn(`! ${name}: ${d.email} collides with another record; left as is`); continue; }
      changed++;
      if (apply) await db.collection(name).updateOne({ _id: d._id }, { $set: { email: lower } });
    }
    console.log(`${name}: ${changed} ${apply ? 'updated' : 'would change'}, ${skipped} skipped`);
  }
  if (!apply) console.log('Dry run only. Re-run with --apply to write.');
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
