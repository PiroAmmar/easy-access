-- apps/web/db/schema.sql
-- Full DDL for the Easy Access database.
-- Run this once on a fresh database, or use the migration files in ./migrations/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE servers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  agent_token  VARCHAR(255) UNIQUE NOT NULL,
  allowed_dirs JSONB NOT NULL DEFAULT '[]',   -- Array of allowed directory paths
  last_seen    TIMESTAMPTZ,
  is_online    BOOLEAN NOT NULL DEFAULT FALSE,
  os           VARCHAR(50),
  disk_usage   JSONB,                          -- { totalGb, usedGb, freeGb }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE activities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       VARCHAR(50) NOT NULL,              -- 'file_read', 'file_write', etc.
  path       TEXT NOT NULL,
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_server_id ON activities(server_id);
CREATE INDEX idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX idx_servers_agent_token ON servers(agent_token);
