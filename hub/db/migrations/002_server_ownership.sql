-- Migration 002: Associate servers with the admin user who created them.
-- Each server now has an owner (admin_id). Users only see their own servers.

ALTER TABLE servers
  ADD COLUMN admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;

-- Assign all existing servers to the first admin (one-time migration for existing data)
UPDATE servers
SET admin_id = (SELECT id FROM admins ORDER BY created_at LIMIT 1)
WHERE admin_id IS NULL;

-- Now make the column non-nullable
ALTER TABLE servers
  ALTER COLUMN admin_id SET NOT NULL;

CREATE INDEX idx_servers_admin_id ON servers(admin_id);
