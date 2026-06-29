// apps/web/lib/db.ts
// Single PostgreSQL connection pool for the entire hub application.
// NEVER create a new Pool anywhere else — always import from this file.

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                    // Maximum concurrent connections
  idleTimeoutMillis: 30_000,  // Close idle connections after 30s
  connectionTimeoutMillis: 5_000, // Fail fast if can't connect in 5s
});

pool.on('error', (err: Error) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

export default pool;
