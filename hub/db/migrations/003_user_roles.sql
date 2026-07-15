-- Migration 003: Role-based accounts.
-- Adds a role to the existing `admins` table so it can hold both
-- administrators (full access) and regular users (scoped to their own
-- servers/activity only). All existing rows are administrators — this
-- migration does not change anyone's access.

ALTER TABLE admins
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin'
  CHECK (role IN ('admin', 'user'));

CREATE INDEX idx_admins_role ON admins(role);
