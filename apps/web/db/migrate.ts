/// <reference types="node" />
// apps/web/db/migrate.ts
// Migration runner — applies numbered SQL files from ./migrations/ in order.
// Run: npx ts-node --project tsconfig.server.json db/migrate.ts

import fs from 'fs';
import path from 'path';

// Load environment variables before initializing the pool
import { loadEnvConfig } from '@next/env';
const projectDir = path.resolve(__dirname, '..');
loadEnvConfig(projectDir);
console.log('DATABASE_URL is:', process.env.DATABASE_URL);

async function migrate() {
  const pool = (await import('../lib/db')).default;
  const client = await pool.connect();

  // Create migrations tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // If docker-compose already applied schema.sql, mark 001_initial_schema.sql as applied
  const { rows: tableExists } = await client.query(
    "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'servers')"
  );
  if (tableExists[0].exists) {
    await client.query(
      "INSERT INTO _migrations (filename) VALUES ('001_initial_schema.sql') ON CONFLICT DO NOTHING"
    );
  }

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort(); // Alphabetical = numerical order with zero-padded filenames

  for (const file of files) {
    const { rows } = await client.query(
      'SELECT id FROM _migrations WHERE filename = $1',
      [file]
    );

    if (rows.length > 0) {
      console.log(`[SKIP] ${file} — already applied`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[OK]   ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[FAIL] ${file}:`, err);
      process.exit(1);
    }
  }

  client.release();
  await pool.end();
  console.log('✓ Migrations complete.');
}

migrate().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
