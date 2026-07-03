// packages/shared/src/types.ts
// Shared TypeScript types matching the PostgreSQL schema.
// Column names are camelCased from snake_case SQL via AS aliases in SELECT queries.

export interface Server {
  id: string;
  name: string;
  description: string | null;
  agentToken: string;
  allowedDirs: string[];         // Deserialized from JSONB
  lastSeen: Date | null;
  isOnline: boolean;
  os: string | null;
  diskUsage: DiskUsageInfo | null;  // Deserialized from JSONB
  createdAt: Date;
  updatedAt: Date;
}

export interface DiskUsageInfo {
  totalGb: number;
  usedGb: number;
  freeGb: number;
}

export interface Activity {
  id: string;
  type: string;
  path: string;
  serverId: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
  // Joined field (present in getAllActivities)
  serverName?: string;
}

export interface Admin {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

// File entry returned by agent list-dir
export interface FileEntry {
  name: string;
  path: string;           // Full absolute path on the remote machine
  type: 'file' | 'directory' | 'symlink';
  size: number;           // Bytes (0 for directories)
  modifiedAt: number;     // Unix epoch ms
  extension: string;      // e.g. ".xlsx", "" for directories
}

// Disk info reported in system-info heartbeat
export interface DiskInfo {
  mount: string;          // e.g. "C:\\" or "/home"
  totalGb: number;
  usedGb: number;
  freeGb: number;
}

// Generic API response shape used by all hub API routes
export interface ApiResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}
