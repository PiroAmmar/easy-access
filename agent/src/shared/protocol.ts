// packages/shared/src/protocol.ts
// WebSocket message schema for Easy Access hub ↔ agent communication.
// ALL WebSocket messages must conform to WSMessage<T>.
// Use crypto.randomUUID() for message IDs — never Math.random() or sequential numbers.

import type { FileEntry, DiskInfo } from './types';

// ─── Base Message Shape ───────────────────────────────────────────────────────

export interface WSMessage<T = unknown> {
  id: string;          // UUID — correlates requests with responses
  type: MessageType;   // See full enum below
  payload: T;          // Type-safe payload per message type
  timestamp: number;   // Unix epoch ms (Date.now())
}

// ─── Message Types ─────────────────────────────────────────────────────────────

export type MessageType =
  // Agent → Hub
  | 'agent:auth'           // Agent authenticates with its token
  | 'agent:auth-error'     // Authentication failed (agent side)
  | 'agent:heartbeat'      // Periodic keepalive (every 30s)
  | 'agent:system-info'    // OS, hostname, CPU, RAM, disk stats
  | 'agent:file-list'      // Response to hub:list-dir
  | 'agent:file-content'   // Response to hub:read-file (base64 for binary)
  | 'agent:file-op-result' // Response to write/delete/move/rename/mkdir
  | 'agent:error'          // Unrecoverable or request-scoped error

  // Hub → Agent
  | 'hub:auth-ok'          // Authentication accepted
  | 'hub:auth-reject'      // Authentication rejected (bad token)
  | 'hub:list-dir'         // Request: list a directory
  | 'hub:read-file'        // Request: read file content
  | 'hub:write-file'       // Request: write/create a file (base64 payload)
  | 'hub:delete-file'      // Request: delete a file or empty directory
  | 'hub:move-file'        // Request: move or rename a file
  | 'hub:mkdir'            // Request: create a directory
  | 'hub:get-system-info'  // Request: fetch current system statistics
  | 'hub:allowed-dirs-update'; // Push: allowed dirs changed on the hub dashboard, apply immediately

// ─── Payload Shapes (Agent → Hub) ─────────────────────────────────────────────

export interface AgentAuthPayload {
  token: string;        // The server's unique agent token from DB
  agentVersion: string; // e.g. "1.0.0"
  allowedDirs: string[];
}

interface AgentHeartbeatPayload {
  serverId: string;
  uptimeSeconds: number;
}

interface AgentSystemInfoPayload {
  os: string;             // e.g. "Windows 11", "Ubuntu 22.04"
  hostname: string;
  cpuUsagePercent: number;
  totalRamMb: number;
  usedRamMb: number;
  disks: DiskInfo[];
}

interface AgentFileListPayload {
  requestId: string;
  path: string;
  entries: FileEntry[];
}

interface AgentFileContentPayload {
  requestId: string;
  path: string;
  content: string;      // Base64 encoded file content
  mimeType: string;     // e.g. "application/vnd.openxmlformats..."
  size: number;         // Original file size in bytes
}

interface AgentFileOpResultPayload {
  requestId: string;
  success: boolean;
  error?: string;
}

interface AgentErrorPayload {
  requestId?: string;   // If error is in response to a specific request
  code: string;         // e.g. "PATH_DENIED", "FILE_NOT_FOUND", "FILE_TOO_LARGE"
  message: string;
}

// ─── Payload Shapes (Hub → Agent) ─────────────────────────────────────────────

interface HubAuthOkPayload {
  serverId: string;     // DB id of the matched server record
  serverName: string;
  allowedDirs: string[]; // Authoritative — set on the hub dashboard, agent must use this for enforcement
}

interface HubListDirPayload {
  requestId: string;    // Echoed in agent:file-list response
  path: string;         // Absolute path on the remote machine
}

interface HubReadFilePayload {
  requestId: string;
  path: string;
}

interface HubWriteFilePayload {
  requestId: string;
  path: string;
  content: string;      // Base64 encoded
  overwrite: boolean;
}

interface HubDeleteFilePayload {
  requestId: string;
  path: string;
}

interface HubMoveFilePayload {
  requestId: string;
  sourcePath: string;
  destinationPath: string;
}

interface HubMkdirPayload {
  requestId: string;
  path: string;
}

interface HubAllowedDirsUpdatePayload {
  allowedDirs: string[];
}

// ─── WebSocket Close Codes ────────────────────────────────────────────────────

export const WS_CLOSE_CODES = {
  INVALID_JSON: 4000,
  AUTH_TIMEOUT: 4001,
  NOT_AUTHENTICATED: 4002,
  INVALID_TOKEN: 4003,
  SERVER_ERROR: 4004,
} as const;

// ─── Helper: create a typed WSMessage ─────────────────────────────────────────

export function createMessage<T>(type: MessageType, payload: T): WSMessage<T> {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
  };
}
