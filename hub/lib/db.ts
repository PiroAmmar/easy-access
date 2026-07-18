// hub/lib/db.ts
// Single PostgreSQL connection pool for the entire hub application.
// NEVER create a new Pool anywhere else — always import from this file.

import { Pool } from 'pg';

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,                    // Maximum concurrent connections
    idleTimeoutMillis: 30_000,  // Close idle connections after 30s
    connectionTimeoutMillis: 5_000, // Fail fast if can't connect in 5s
  });

// ALWAYS cache on globalThis — the custom server (tsx) and the Next-bundled
// API routes are separate module graphs in the same process. Without this,
// production would get two pools (and two ConnectionManagers).
globalForDb.pool = pool;

pool.on('error', (err: Error) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

export default pool;
