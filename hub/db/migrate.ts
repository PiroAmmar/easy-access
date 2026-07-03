// hub/db/migrate.ts
// Manual migration runner CLI. Migrations also run automatically on server
// startup (see lib/bootstrap.ts) — this exists for running them by hand.
// Run: npm run migrate

import path from 'path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(path.resolve(__dirname, '..'));

async function main() {
  const { runMigrations } = await import('../lib/bootstrap');
  const pool = (await import('../lib/db')).default;
  await runMigrations();
  await pool.end();
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
