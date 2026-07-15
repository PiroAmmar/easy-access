// hub/db/create-admin.ts
// CLI script to create a new account (admin or user).
//
// Usage (local):
//   npm run create-admin <username> <password> [role]
//   role defaults to "admin" if omitted — pass "user" for a restricted account.
//
// Usage (Railway via Railway CLI):
//   railway run npm run create-admin <username> <password> [role]
//
// The script will refuse to create a duplicate username.

import bcrypt from 'bcryptjs';
import path from 'path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(path.resolve(__dirname, '..'));

async function createAdminCli(): Promise<void> {
  const args = process.argv.slice(2);
  const username = args[0];
  const password = args[1];
  const roleArg = (args[2] ?? 'admin').toLowerCase();

  if (!username || !password) {
    console.error('Usage: tsx db/create-admin.ts <username> <password> [admin|user]');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: password must be at least 8 characters.');
    process.exit(1);
  }

  if (roleArg !== 'admin' && roleArg !== 'user') {
    console.error('Error: role must be "admin" or "user".');
    process.exit(1);
  }
  const role = roleArg as 'admin' | 'user';

  const pool = (await import('../lib/db')).default;
  const { getAdminByUsername, createAdmin } = await import('./queries');

  try {
    const existing = await getAdminByUsername(username.trim().toLowerCase());
    if (existing) {
      console.error(`Error: account "${username}" already exists.`);
      await pool.end();
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const account = await createAdmin(username.trim().toLowerCase(), passwordHash, role);

    console.log(`✓ Account created successfully!`);
    console.log(`  Username : ${account.username}`);
    console.log(`  Role     : ${account.role}`);
    console.log(`  ID       : ${account.id}`);
    console.log(`  Created  : ${account.createdAt}`);
  } finally {
    await pool.end();
  }
}

createAdminCli().catch((err: unknown) => {
  console.error('Failed to create account:', err);
  process.exit(1);
});
