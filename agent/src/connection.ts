// agent/src/connection.ts
// WebSocket client for the Easy Access agent.
// Connects outbound to the hub, authenticates with the agent token,
// and handles all hub-initiated file operation requests.

import { WebSocket } from 'ws';
import type { WSMessage, MessageType, AgentAuthPayload } from './shared';
import { createMessage, WS_CLOSE_CODES } from './shared';
import type { AgentConfig } from './config';
import { listDirectory, readFile, writeFile, deleteFile, moveFile, makeDirectory, SecurityError } from './file-ops';
import { getSystemInfo } from './system-info';
import { log } from './logger';

const PKG_VERSION = '1.0.0';

// Reconnect delays: 1s, 2s, 5s, 10s, 30s (then stays at 30s)
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];
const HEARTBEAT_INTERVAL_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'auth-failed';

export interface ConnectionStatus {
  state: ConnectionState;
  serverName: string | null;
  serverId: string | null;
  connectedSince: number | null;
  lastError: string | null;
}

export class AgentConnection {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private authenticated = false;
  private serverId: string | null = null;
  private serverName: string | null = null;
  private connectedSince: number | null = null;
  private lastError: string | null = null;
  private authFailed = false;
  private stopped = false;
  // Authoritative allowed dirs as set on the hub dashboard, received at
  // auth time (and updated live if changed while connected). This is what
  // actually gets enforced — the local config.json value is only ever used
  // as a fallback before the first successful connection.
  private hubAllowedDirs: string[] | null = null;

  private getEffectiveAllowedDirs(): string[] {
    return this.hubAllowedDirs ?? this.config.allowedDirs;
  }

  constructor(private readonly config: AgentConfig) {}

  getStatus(): ConnectionStatus {
    let state: ConnectionState = 'disconnected';
    if (this.authFailed) state = 'auth-failed';
    else if (this.authenticated) state = 'connected';
    else if (!this.stopped) state = 'connecting';

    return {
      state,
      serverName: this.serverName,
      serverId: this.serverId,
      connectedSince: this.connectedSince,
      lastError: this.lastError,
    };
  }

  start(): void {
    this.stopped = false;
    this.authFailed = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.authenticated = false;
    this.connectedSince = null;
  }

  private connect(): void {
    if (this.stopped) return;

    log.info(`Connecting to hub: ${this.config.hubUrl}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.config.hubUrl);
    } catch (err) {
      this.lastError = (err as Error).message;
      log.error(`Failed to open connection: ${this.lastError}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      log.info('Connection opened — authenticating');

      const authPayload: AgentAuthPayload = {
        token: this.config.agentToken,
        agentVersion: PKG_VERSION,
        allowedDirs: this.config.allowedDirs,
      };
      this.send('agent:auth', authPayload);

      setTimeout(() => {
        if (!this.authenticated && this.ws === ws) {
          log.warn('Auth timeout — closing connection');
          ws.close(WS_CLOSE_CODES.AUTH_TIMEOUT, 'Auth timeout');
        }
      }, AUTH_TIMEOUT_MS);
    });

    ws.on('message', (data) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(data.toString()) as WSMessage;
      } catch {
        log.error('Received invalid JSON from hub');
        return;
      }

      this.handleMessage(msg).catch((err) => {
        log.error(`Unhandled error in message handler: ${(err as Error).message}`);
      });
    });

    ws.on('close', (code, reason) => {
      if (this.ws !== ws) return; // stale socket
      this.authenticated = false;
      this.connectedSince = null;
      this.stopHeartbeat();

      const reasonStr = reason.toString();
      log.info(`Disconnected: code=${code}${reasonStr ? `, reason=${reasonStr}` : ''}`);

      // Don't reconnect on auth rejection — a bad token won't fix itself.
      if (code === WS_CLOSE_CODES.INVALID_TOKEN) {
        this.authFailed = true;
        this.lastError = 'Authentication rejected — check your agent token';
        log.error('Authentication rejected — check your agent token. Not reconnecting.');
        return;
      }

      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      // 'close' fires after 'error' — reconnect logic is handled there
      this.lastError = err.message;
      log.error(`WebSocket error: ${err.message}`);
    });
  }

  private async handleMessage(msg: WSMessage): Promise<void> {
    switch (msg.type) {
      case 'hub:auth-ok': {
        const payload = msg.payload as { serverId: string; serverName: string; allowedDirs?: string[] };
        this.authenticated = true;
        this.authFailed = false;
        this.serverId = payload.serverId;
        this.serverName = payload.serverName;
        this.hubAllowedDirs = Array.isArray(payload.allowedDirs) ? payload.allowedDirs : [];
        this.connectedSince = Date.now();
        this.lastError = null;
        this.reconnectAttempt = 0; // Reset backoff on successful auth
        this.startHeartbeat();
        log.info(`Authenticated as: ${payload.serverName}`);
        break;
      }

      case 'hub:allowed-dirs-update': {
        const { allowedDirs } = msg.payload as { allowedDirs: string[] };
        this.hubAllowedDirs = Array.isArray(allowedDirs) ? allowedDirs : [];
        log.info(`Allowed directories updated from hub dashboard (${this.hubAllowedDirs.length} dir(s))`);
        break;
      }

      case 'hub:auth-reject': {
        log.error('Authentication rejected by hub');
        this.ws?.close(WS_CLOSE_CODES.INVALID_TOKEN, 'Auth rejected');
        break;
      }

      case 'hub:list-dir': {
        const { requestId, path } = msg.payload as { requestId: string; path: string };
        try {
          const entries = await listDirectory(path, this.getEffectiveAllowedDirs());
          this.send('agent:file-list', { requestId, path, entries });
        } catch (err) {
          this.sendError(requestId, err);
        }
        break;
      }

      case 'hub:read-file': {
        const { requestId, path } = msg.payload as { requestId: string; path: string };
        try {
          const result = await readFile(path, this.getEffectiveAllowedDirs());
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
          await writeFile(path, content, this.getEffectiveAllowedDirs(), overwrite);
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
          await deleteFile(path, this.getEffectiveAllowedDirs());
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
          await moveFile(sourcePath, destinationPath, this.getEffectiveAllowedDirs());
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
          await makeDirectory(path, this.getEffectiveAllowedDirs());
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
        const { requestId } = msg.payload as { requestId?: string };
        try {
          const sysInfo = await getSystemInfo(this.getEffectiveAllowedDirs());
          // Echo requestId so the hub can pair this with its request
          this.send('agent:system-info', { ...sysInfo, requestId });
        } catch (err) {
          log.error(`Failed to get system info: ${(err as Error).message}`);
        }
        break;
      }

      default:
        log.warn(`Unknown message type: ${msg.type}`);
    }
  }

  private sendError(requestId: string | undefined, err: unknown): void {
    const error = err as Error;
    const isSecurityError = err instanceof SecurityError;
    const code = isSecurityError ? (err as SecurityError).code : 'UNKNOWN_ERROR';

    log.warn(`Request failed (${code}): ${error.message}`);
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
    log.info(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send<T>(type: MessageType, payload: T): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      log.warn(`Cannot send ${type} — not connected`);
      return;
    }
    const msg = createMessage(type, payload);
    this.ws.send(JSON.stringify(msg));
  }
}
