/// <reference types="node" />
// apps/web/db/create-admin.ts
// CLI script to create a new admin user.
//
// Usage (local):
//   pnpm --filter @easy-access/web tsx db/create-admin.ts <username> <password>
//
// Usage (Railway — via Railway CLI):
//   railway run pnpm --filter @easy-access/web tsx db/create-admin.ts <username> <password>
//
// The script will refuse to create a duplicate username.

import bcrypt from 'bcryptjs';
import path from 'path';

import { loadEnvConfig } from '@next/env';
const projectDir = path.resolve(__dirname, '..');
loadEnvConfig(projectDir);

async function createAdminCli(): Promise<void> {
  const args = process.argv.slice(2);
  const username = args[0];
  const password = args[1];

  if (!username || !password) {
    console.error('Usage: tsx db/create-admin.ts <username> <password>');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: password must be at least 8 characters.');
    process.exit(1);
  }

  const pool = (await import('../lib/db')).default;
  const { getAdminByUsername, createAdmin } = await import('./queries');

  try {
    const existing = await getAdminByUsername(username.trim().toLowerCase());
    if (existing) {
      console.error(`Error: admin "${username}" already exists.`);
      await pool.end();
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await createAdmin(username.trim().toLowerCase(), passwordHash);

    console.log(`✓ Admin created successfully!`);
    console.log(`  Username : ${admin.username}`);
    console.log(`  ID       : ${admin.id}`);
    console.log(`  Created  : ${admin.createdAt}`);
  } finally {
    await pool.end();
  }
}

createAdminCli().catch((err: unknown) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
