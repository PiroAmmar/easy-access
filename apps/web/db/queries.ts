// apps/web/db/queries.ts
// All parameterized SQL queries for the Easy Access hub.
// CRITICAL: NEVER interpolate user input into SQL strings.
// ALWAYS use $1, $2, ... placeholders.

import pool from '../lib/db';
import type { QueryResult, PoolClient } from 'pg';
import type { Server, Activity, Admin, DiskUsageInfo } from '@easy-access/shared';

// ─── Core Query Helpers ────────────────────────────────────────────────────────

/**
 * Execute a parameterized SQL query and return typed rows.
 */
export async function query<T extends object>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result: QueryResult<T> = await pool.query<T>(text, params);
  return result.rows;
}

/**
 * Execute a query and return the first row, or null if no rows matched.
 */
export async function queryOne<T extends object>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Execute a query that does not return rows (INSERT, UPDATE, DELETE).
 * Returns the number of rows affected.
 */
export async function execute(
  text: string,
  params: unknown[] = []
): Promise<number> {
  const result = await pool.query(text, params);
  return result.rowCount ?? 0;
}

/**
 * Run multiple queries in a single transaction.
 * If any query throws, the entire transaction is rolled back.
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Server Queries ────────────────────────────────────────────────────────────

const SERVER_SELECT = `
  SELECT id, name, description,
         agent_token   AS "agentToken",
         allowed_dirs  AS "allowedDirs",
         last_seen     AS "lastSeen",
         is_online     AS "isOnline",
         os,
         disk_usage    AS "diskUsage",
         created_at    AS "createdAt",
         updated_at    AS "updatedAt"
  FROM servers
`;

/**
 * Get a server by its agent token — used during WebSocket authentication.
 */
export async function getServerByToken(token: string): Promise<Server | null> {
  return queryOne<Server>(
    `${SERVER_SELECT} WHERE agent_token = $1`,
    [token]
  );
}

/**
 * Get all servers ordered by creation date (for dashboard overview).
 */
export async function getAllServers(): Promise<Server[]> {
  return query<Server>(`${SERVER_SELECT} ORDER BY created_at DESC`);
}

/**
 * Get a single server by its UUID.
 */
export async function getServerById(id: string): Promise<Server | null> {
  return queryOne<Server>(
    `${SERVER_SELECT} WHERE id = $1`,
    [id]
  );
}

/**
 * Create a new server registration.
 * Token must be generated with generateAgentToken() before calling this.
 */
export async function createServer(data: {
  name: string;
  description?: string;
  agentToken: string;
  allowedDirs: string[];
}): Promise<Server> {
  const [server] = await query<Server>(
    `INSERT INTO servers (name, description, agent_token, allowed_dirs)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, description,
               agent_token  AS "agentToken",
               allowed_dirs AS "allowedDirs",
               last_seen    AS "lastSeen",
               is_online    AS "isOnline",
               os,
               disk_usage   AS "diskUsage",
               created_at   AS "createdAt",
               updated_at   AS "updatedAt"`,
    [data.name, data.description ?? null, data.agentToken, JSON.stringify(data.allowedDirs)]
  );
  return server;
}

/**
 * Mark a server online or offline. Called by the connection manager on connect/disconnect.
 */
export async function updateServerOnlineStatus(
  id: string,
  isOnline: boolean
): Promise<void> {
  await execute(
    `UPDATE servers
     SET is_online = $1, last_seen = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [isOnline, id]
  );
}

/**
 * Update disk/OS info reported during agent system-info.
 */
export async function updateServerSystemInfo(
  id: string,
  info: { os?: string; diskUsage?: DiskUsageInfo }
): Promise<void> {
  await execute(
    `UPDATE servers
     SET os         = COALESCE($1, os),
         disk_usage = COALESCE($2::jsonb, disk_usage),
         updated_at = NOW()
     WHERE id = $3`,
    [info.os ?? null, info.diskUsage ? JSON.stringify(info.diskUsage) : null, id]
  );
}

/**
 * Update the allowed directories for a server.
 */
export async function updateServerAllowedDirs(
  id: string,
  allowedDirs: string[]
): Promise<void> {
  await execute(
    `UPDATE servers
     SET allowed_dirs = $1::jsonb, updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(allowedDirs), id]
  );
}

/**
 * Delete a server by ID. All related activities are cascade-deleted.
 */
export async function deleteServer(id: string): Promise<boolean> {
  const affected = await execute('DELETE FROM servers WHERE id = $1', [id]);
  return affected > 0;
}

// ─── Activity Queries ──────────────────────────────────────────────────────────

/**
 * Log a file operation activity.
 */
export async function logActivity(data: {
  type: string;
  path: string;
  serverId: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await execute(
    `INSERT INTO activities (type, path, server_id, details)
     VALUES ($1, $2, $3, $4)`,
    [data.type, data.path, data.serverId, data.details ? JSON.stringify(data.details) : null]
  );
}

/**
 * Get recent activity for a specific server.
 */
export async function getServerActivities(
  serverId: string,
  limit = 100
): Promise<Activity[]> {
  return query<Activity>(
    `SELECT id, type, path,
            server_id  AS "serverId",
            details,
            created_at AS "createdAt"
     FROM activities
     WHERE server_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [serverId, limit]
  );
}

/**
 * Get all recent activity across all servers (joined with server name).
 */
export async function getAllActivities(limit = 200): Promise<Activity[]> {
  return query<Activity>(
    `SELECT a.id, a.type, a.path,
            a.server_id AS "serverId",
            a.details,
            a.created_at AS "createdAt",
            s.name AS "serverName"
     FROM activities a
     JOIN servers s ON s.id = a.server_id
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

// ─── Admin Queries ─────────────────────────────────────────────────────────────

/**
 * Find an admin by username — used during login credential check.
 */
export async function getAdminByUsername(username: string): Promise<Admin | null> {
  return queryOne<Admin>(
    `SELECT id, username,
            password_hash AS "passwordHash",
            created_at    AS "createdAt"
     FROM admins WHERE username = $1`,
    [username]
  );
}

/**
 * Create the initial admin account. Run once during setup.
 * The passwordHash must be pre-hashed with bcrypt before calling this.
 */
export async function createAdmin(
  username: string,
  passwordHash: string
): Promise<Admin> {
  const [admin] = await query<Admin>(
    `INSERT INTO admins (username, password_hash)
     VALUES ($1, $2)
     RETURNING id, username,
               password_hash AS "passwordHash",
               created_at    AS "createdAt"`,
    [username, passwordHash]
  );
  return admin;
}
