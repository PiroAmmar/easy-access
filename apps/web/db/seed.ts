/// <reference types="node" />
// apps/web/db/seed.ts
// Creates the initial admin account for development.
// Run: npx tsx apps/web/db/seed.ts
// Default: username=admin, password=admin

import bcrypt from 'bcryptjs';
import path from 'path';

// Load environment variables before initializing the pool
import { loadEnvConfig } from '@next/env';
const projectDir = path.resolve(__dirname, '..');
loadEnvConfig(projectDir);

async function seed() {
  const pool = (await import('../lib/db')).default;
  const { createAdmin, getAdminByUsername } = await import('./queries');

  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin';

  const existing = await getAdminByUsername(username);
  if (existing) {
    console.log(`Admin "${username}" already exists. Skipping.`);
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await createAdmin(username, passwordHash);

  console.log(`✓ Admin created: ${admin.username} (${admin.id})`);
  console.log(`  Password: ${password}`);
  console.log(`  Change the password in production!`);

  await pool.end();
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
