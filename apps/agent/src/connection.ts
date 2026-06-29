// apps/agent/src/connection.ts
// WebSocket client for the Easy Access agent.
// Connects outbound to the hub, authenticates with the agent token,
// and handles all hub-initiated file operation requests.

import { WebSocket } from 'ws';
import type { WSMessage, MessageType, AgentAuthPayload } from '@easy-access/shared';
import { createMessage, WS_CLOSE_CODES } from '@easy-access/shared';
import type { AgentConfig } from './config';
import { listDirectory, readFile, writeFile, deleteFile, moveFile, makeDirectory, SecurityError } from './file-ops';
import { getSystemInfo } from './system-info';

const PKG_VERSION = '0.1.0';

// Reconnect delays: 1s, 2s, 5s, 10s, 30s (then stays at 30s)
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];
const HEARTBEAT_INTERVAL_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;

export class AgentConnection {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private authenticated = false;
  private serverId: string | null = null;
  private stopped = false;

  constructor(private readonly config: AgentConfig) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (this.stopped) return;

    console.log(`[Agent] Connecting to hub: ${this.config.hubUrl}`);
    this.ws = new WebSocket(this.config.hubUrl);

    this.ws.on('open', () => {
      console.log('[Agent] Connection opened — sending auth');

      // Step 1: Send auth immediately on connection open
      const authPayload: AgentAuthPayload = {
        token: this.config.agentToken,
        agentVersion: PKG_VERSION,
      };
      this.send('agent:auth', authPayload);

      // Step 2: Set auth timeout
      setTimeout(() => {
        if (!this.authenticated) {
          console.warn('[Agent] Auth timeout — closing connection');
          this.ws?.close(WS_CLOSE_CODES.AUTH_TIMEOUT, 'Auth timeout');
        }
      }, AUTH_TIMEOUT_MS);
    });

    this.ws.on('message', (data) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(data.toString()) as WSMessage;
      } catch {
        console.error('[Agent] Received invalid JSON from hub');
        return;
      }

      this.handleMessage(msg).catch((err) => {
        console.error(`[Agent] Unhandled error in message handler:`, err);
      });
    });

    this.ws.on('close', (code, reason) => {
      this.authenticated = false;
      this.stopHeartbeat();

      const reasonStr = reason.toString();
      console.log(`[Agent] Disconnected: code=${code}, reason=${reasonStr}`);

      // Don't reconnect on auth rejection
      if (code === WS_CLOSE_CODES.INVALID_TOKEN) {
        console.error('[Agent] Authentication rejected — check your agent token. Not reconnecting.');
        return;
      }

      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      // onclose fires after onerror — reconnect logic is handled there
      console.error('[Agent] WebSocket error:', err.message);
    });
  }

  private async handleMessage(msg: WSMessage): Promise<void> {
    console.log(`[Agent] Received message type: ${msg.type}`);

    switch (msg.type) {
      case 'hub:auth-ok': {
        const payload = msg.payload as { serverId: string; serverName: string };
        this.authenticated = true;
        this.serverId = payload.serverId;
        this.reconnectAttempt = 0; // Reset backoff on successful auth
        this.startHeartbeat();
        console.log(`[Agent] Authenticated as: ${payload.serverName} (${payload.serverId})`);
        break;
      }

      case 'hub:auth-reject': {
        console.error('[Agent] Authentication rejected by hub');
        this.ws?.close(WS_CLOSE_CODES.INVALID_TOKEN, 'Auth rejected');
        break;
      }

      case 'hub:list-dir': {
        const { requestId, path } = msg.payload as { requestId: string; path: string };
        try {
          const entries = await listDirectory(path, this.config.allowedDirs);
          this.send('agent:file-list', { requestId, path, entries });
        } catch (err) {
          this.sendError(requestId, err);
        }
        break;
      }

      case 'hub:read-file': {
        const { requestId, path } = msg.payload as { requestId: string; path: string };
        try {
          const result = await readFile(path, this.config.allowedDirs);
          this.send('agent:file-content', { requestId, path, ...result });
        } catch (err) {
          this.sendError(requestId, err);
        }
        break;
      }

      case 'hub:write-file': {
        const { requestId, path, content, overwrite } = msg.payload as {
          requestId: string;
          path: string;
          content: string;
          overwrite: boolean;
        };
        try {
          await writeFile(path, content, this.config.allowedDirs, overwrite);
          this.send('agent:file-op-result', { requestId, success: true });
        } catch (err) {
          this.send('agent:file-op-result', {
            requestId,
            success: false,
            error: (err as Error).message,
          });
        }
        break;
      }

      case 'hub:delete-file': {
        const { requestId, path } = msg.payload as { requestId: string; path: string };
        try {
          await deleteFile(path, this.config.allowedDirs);
          this.send('agent:file-op-result', { requestId, success: true });
        } catch (err) {
          this.send('agent:file-op-result', {
            requestId,
            success: false,
            error: (err as Error).message,
          });
        }
        break;
      }

      case 'hub:move-file': {
        const { requestId, sourcePath, destinationPath } = msg.payload as {
          requestId: string;
          sourcePath: string;
          destinationPath: string;
        };
        try {
          await moveFile(sourcePath, destinationPath, this.config.allowedDirs);
          this.send('agent:file-op-result', { requestId, success: true });
        } catch (err) {
          this.send('agent:file-op-result', {
            requestId,
            success: false,
            error: (err as Error).message,
          });
        }
        break;
      }

      case 'hub:mkdir': {
        const { requestId, path } = msg.payload as { requestId: string; path: string };
        try {
          await makeDirectory(path, this.config.allowedDirs);
          this.send('agent:file-op-result', { requestId, success: true });
        } catch (err) {
          this.send('agent:file-op-result', {
            requestId,
            success: false,
            error: (err as Error).message,
          });
        }
        break;
      }

      case 'hub:get-system-info': {
        try {
          const sysInfo = await getSystemInfo(this.config.allowedDirs);
          this.send('agent:system-info', sysInfo);
        } catch (err) {
          console.error('[Agent] Failed to get system info:', (err as Error).message);
          this.send('agent:system-info', {
            os: process.platform,
            hostname: require('os').hostname(),
            cpuUsagePercent: 0,
            totalRamMb: 0,
            usedRamMb: 0,
            disks: [],
          });
        }
        break;
      }

      default:
        console.log(`[Agent] Unknown message type: ${msg.type}`);
    }
  }

  private sendError(requestId: string | undefined, err: unknown): void {
    const error = err as Error;
    const isSecurityError = err instanceof SecurityError;
    const code = isSecurityError ? (err as SecurityError).code : 'UNKNOWN_ERROR';

    this.send('agent:error', {
      requestId,
      code,
      message: error.message,
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send('agent:heartbeat', {
          serverId: this.serverId ?? '',
          uptimeSeconds: Math.floor(process.uptime()),
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = RECONNECT_DELAYS_MS[
      Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
    ];
    this.reconnectAttempt++;
    console.log(`[Agent] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    setTimeout(() => this.connect(), delay);
  }

  send<T>(type: MessageType, payload: T): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn(`[Agent] Cannot send ${type} — not connected`);
      return;
    }
    const msg = createMessage(type, payload);
    this.ws.send(JSON.stringify(msg));
  }
}
