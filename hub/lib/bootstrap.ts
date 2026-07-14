// hub/lib/bootstrap.ts
// Startup tasks run by server.ts before the hub accepts traffic:
//   1. Apply pending SQL migrations from db/migrations/
//   2. Ensure the admin account matches ADMIN_USERNAME / ADMIN_PASSWORD env vars
// Both are idempotent — safe to run on every boot (Railway restarts included).

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import pool from './db';

/**
 * Wait for Postgres to accept connections before running migrations.
 * Railway doesn't guarantee the DB service is ready before this one boots
 * (and the DB may briefly be unreachable during its own crash-recovery),
 * so a single 5s-timeout connect attempt isn't reliable at cold start.
 */
async function waitForDb(retries = 10, delayMs = 3_000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (err) {
      if (attempt === retries) {
        throw new Error(
          `Could not reach database after ${retries} attempts: ${(err as Error).message}`
        );
      }
      console.warn(
        `[DB] Connect attempt ${attempt}/${retries} failed (${(err as Error).message}), retrying in ${delayMs}ms...`
      );
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          SERIAL PRIMARY KEY,
        filename    VARCHAR(255) UNIQUE NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // If docker-compose already applied schema.sql, mark 001 as applied
    const { rows: tableExists } = await client.query(
      "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'servers')"
    );
    if (tableExists[0].exists) {
      await client.query(
        "INSERT INTO _migrations (filename) VALUES ('001_initial_schema.sql') ON CONFLICT DO NOTHING"
      );
    }

    const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // Alphabetical = numerical order with zero-padded filenames

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [file]
      );
      if (rows.length > 0) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[Migrate] Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  console.log('[Migrate] Database is up to date');
}

/**
 * Create the admin account from env vars, or update its password if it changed.
 * Falls back to admin/admin for local development (with a loud warning).
 */
export async function ensureAdmin(): Promise<void> {
  const username = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'admin';

  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      '[Admin] ADMIN_PASSWORD is not set — using default password "admin". ' +
      'Set ADMIN_USERNAME and ADMIN_PASSWORD env vars before exposing this hub to the internet!'
    );
  }

  const { rows } = await pool.query<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM admins WHERE LOWER(username) = LOWER($1)',
    [username]
  );

  if (rows.length === 0) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
      [username, hash]
    );
    console.log(`[Admin] Created admin account "${username}"`);
    return;
  }

  // Update the stored hash if the env password changed
  const matches = await bcrypt.compare(password, rows[0].password_hash);
  if (!matches) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [
      hash,
      rows[0].id,
    ]);
    console.log(`[Admin] Updated password for admin account "${username}"`);
  }
}

export async function bootstrap(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Locally: copy .env.local.example to .env.local. ' +
      'On Railway: add a PostgreSQL database and reference its DATABASE_URL variable.'
    );
  }
  await waitForDb();
  await runMigrations();
  await ensureAdmin();
}