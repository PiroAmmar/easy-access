// apps/web/lib/connection-manager.ts
// In-memory manager for connected agent WebSocket connections.
// Tracks live connections and pairs async requests with agent responses.

import { WebSocket } from 'ws';
import { updateServerOnlineStatus, updateServerSystemInfo, logActivity } from '@/db/queries';
import type { WSMessage, MessageType, DiskInfo } from '@easy-access/shared';

type PendingCallback = (payload: unknown) => void;

interface ServerDiskInfo {
  totalGb: number;
  usedGb: number;
  freeGb: number;
}

class ConnectionManager {
  /** serverId → active WebSocket */
  private connections = new Map<string, WebSocket>();

  /** requestId → resolve callback (for request/response pairing) */
  private pending = new Map<string, PendingCallback>();

  /** Track system info polling intervals per server */
  private systemInfoIntervals = new Map<string, ReturnType<typeof setInterval>>();

  register(serverId: string, ws: WebSocket): void {
    this.connections.set(serverId, ws);
    updateServerOnlineStatus(serverId, true).catch((err) =>
      console.error('[CM] Failed to mark server online:', err)
    );
    this.startSystemInfoPolling(serverId);
  }

  unregister(serverId: string): void {
    this.connections.delete(serverId);
    updateServerOnlineStatus(serverId, false).catch((err) =>
      console.error('[CM] Failed to mark server offline:', err)
    );
    this.stopSystemInfoPolling(serverId);
  }

  isOnline(serverId: string): boolean {
    const ws = this.connections.get(serverId);
    return ws?.readyState === WebSocket.OPEN;
  }

  getOnlineServerIds(): string[] {
    return Array.from(this.connections.keys()).filter((id) => this.isOnline(id));
  }

  /**
   * Send a request to an agent and await its typed response.
   * Rejects if the agent doesn't respond within timeoutMs.
   */
  async request<TPayload, TResponse>(
    serverId: string,
    type: MessageType,
    payload: TPayload,
    timeoutMs = 30_000
  ): Promise<TResponse> {
    const ws = this.connections.get(serverId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const requestId = crypto.randomUUID();

    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(requestId, (responsePayload) => {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve(responsePayload as TResponse);
      });

      ws.send(
        JSON.stringify({
          id: crypto.randomUUID(),
          type,
          payload: { ...payload, requestId },
          timestamp: Date.now(),
        })
      );
    });
  }

  /**
   * Called by ws-server when an agent response arrives.
   * Resolves the matching pending request by requestId.
   */
  resolveRequest(requestId: string, payload: unknown): void {
    const cb = this.pending.get(requestId);
    if (cb) cb(payload);
  }

  /**
   * Route incoming agent messages to the correct handler.
   */
  handleAgentMessage(serverId: string, msg: WSMessage): void {
    const payload = msg.payload as Record<string, unknown>;
    const requestId = payload?.requestId as string | undefined;

    // Resolve pending request if this is a response to a hub request
    if (requestId && this.pending.has(requestId)) {
      this.resolveRequest(requestId, msg.payload);
      return;
    }

    // Handle heartbeat
    if (msg.type === 'agent:heartbeat') {
      updateServerOnlineStatus(serverId, true).catch(() => {});
      return;
    }

    // Handle system info from agent
    if (msg.type === 'agent:system-info') {
      const sysInfo = msg.payload as {
        os: string;
        hostname: string;
        cpuUsagePercent: number;
        totalRamMb: number;
        usedRamMb: number;
        disks: DiskInfo[];
      };
      this.handleSystemInfo(serverId, sysInfo);
      return;
    }

    // Handle agent errors not tied to a request
    if (msg.type === 'agent:error') {
      const err = msg.payload as { code: string; message: string; requestId?: string };
      console.error(`[CM] Agent error from ${serverId}:`, err);
      // If there's a requestId but no pending callback, it's an unsolicited error
      return;
    }

    console.log(`[CM] Unhandled message type: ${msg.type} from ${serverId}`);
  }

  private handleSystemInfo(serverId: string, info: {
    os: string;
    hostname: string;
    cpuUsagePercent: number;
    totalRamMb: number;
    usedRamMb: number;
    disks: DiskInfo[];
  }): void {
    // Convert DiskInfo to ServerDiskInfo format for DB
    const diskUsage: ServerDiskInfo = {
      totalGb: info.disks.reduce((sum, d) => sum + d.totalGb, 0),
      usedGb: info.disks.reduce((sum, d) => sum + d.usedGb, 0),
      freeGb: info.disks.reduce((sum, d) => sum + d.freeGb, 0),
    };

    updateServerSystemInfo(serverId, {
      os: info.os,
      diskUsage,
    }).catch((err) => console.error('[CM] Failed to update server system info:', err));
  }

  private startSystemInfoPolling(serverId: string): void {
    // Poll system info every 60 seconds
    const interval = setInterval(() => {
      if (!this.isOnline(serverId)) {
        this.stopSystemInfoPolling(serverId);
        return;
      }
      this.requestSystemInfo(serverId).catch(() => {
        // Ignore errors - agent might be busy
      });
    }, 60_000);

    this.systemInfoIntervals.set(serverId, interval);
    // Initial request
    this.requestSystemInfo(serverId).catch(() => {});
  }

  private stopSystemInfoPolling(serverId: string): void {
    const interval = this.systemInfoIntervals.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.systemInfoIntervals.delete(serverId);
    }
  }

  private async requestSystemInfo(serverId: string): Promise<void> {
    try {
      await this.request(serverId, 'hub:get-system-info', {}, 10_000);
    } catch (err) {
      // Ignore - agent might not support this yet or be busy
      console.debug(`[CM] System info request failed for ${serverId}:`, err);
    }
  }
}

const globalForConnectionManager = globalThis as unknown as {
  connectionManager: ConnectionManager | undefined;
};

export const connectionManager =
  globalForConnectionManager.connectionManager ?? new ConnectionManager();

if (process.env.NODE_ENV !== 'production') {
  globalForConnectionManager.connectionManager = connectionManager;
}
