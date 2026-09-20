// scripts/reset-password.ts
//
// For when someone emails the support address because "Forgot password" told
// them email reset isn't set up. Run from a machine with the production
// MONGODB_URI:
//
//   RESET_EMAIL=person@example.com npm run db:reset-password
//
// It sets a NEW temporary password on every account that email owns (customer
// and/or staff, at any salon), ends their sessions, and prints the password
// once. Send it to the person over the same email thread. Staff are made to
// choose their own password at next sign-in; customers can change theirs on
// the Account page. Only reset for the address the request came FROM.
// The platform super_admin is never touched.
import { MongoClient } from 'mongodb';
import { resetPasswordForEmail } from '../src/lib/accountReset';

const MONGODB_URI = process.env.MONGODB_URI;
const RESET_EMAIL = process.env.RESET_EMAIL;
if (!MONGODB_URI) throw new Error('MONGODB_URI env var required');
if (!RESET_EMAIL) throw new Error('RESET_EMAIL env var required');

async function main() {
  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  try {
    const result = await resetPasswordForEmail(client.db('chair-app'), RESET_EMAIL!);
    if (!result) {
      console.error(`No account found for ${RESET_EMAIL}. Nothing was changed.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Reset ${result.email}: ${result.staffAccounts} staff account(s)${result.customerAccount ? ' + customer account' : ''}.`);
    console.log(`Temporary password: ${result.password}`);
    console.log(`Valid until ${result.expiresAt.toISOString().slice(0, 10)}. Send it to the person, and do not keep this output.`);
  } finally {
    await client.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
