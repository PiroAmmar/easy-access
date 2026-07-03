// hub/db/seed.ts
// Manual admin seeding CLI. The admin account is also created/updated
// automatically on server startup from ADMIN_USERNAME / ADMIN_PASSWORD
// (see lib/bootstrap.ts) — this exists for running it by hand.
// Run: npm run seed

import path from 'path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(path.resolve(__dirname, '..'));

async function main() {
  const { ensureAdmin } = await import('../lib/bootstrap');
  const pool = (await import('../lib/db')).default;
  await ensureAdmin();
  await pool.end();
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
