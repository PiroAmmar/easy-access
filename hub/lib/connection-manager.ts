// hub/lib/connection-manager.ts
// In-memory manager for connected agent WebSocket connections.
// Tracks live connections and pairs async requests with agent responses.

import { WebSocket } from 'ws';
import crypto from 'crypto';
import { updateServerOnlineStatus, updateServerSystemInfo } from '@/db/queries';
import type { WSMessage, MessageType, DiskInfo } from '@easy-access/shared';

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (err: Error) => void;
}

interface ServerDiskInfo {
  totalGb: number;
  usedGb: number;
  freeGb: number;
}

class ConnectionManager {
  /** serverId → active WebSocket */
  private connections = new Map<string, WebSocket>();

  /** requestId → resolve/reject callbacks (for request/response pairing) */
  private pending = new Map<string, PendingRequest>();

  /** Track system info polling intervals per server */
  private systemInfoIntervals = new Map<string, ReturnType<typeof setInterval>>();

  register(serverId: string, ws: WebSocket): void {
    // Close a stale previous socket for the same server (e.g. after a network drop)
    const existing = this.connections.get(serverId);
    if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
      existing.close(4005, 'Replaced by a new connection');
    }
    this.connections.set(serverId, ws);
    updateServerOnlineStatus(serverId, true).catch((err) =>
      console.error('[CM] Failed to mark server online:', err)
    );
    this.startSystemInfoPolling(serverId);
  }

  unregister(serverId: string, ws?: WebSocket): void {
    // Only unregister if the closing socket is still the registered one —
    // otherwise a stale socket's close event would kick out a fresh connection.
    if (ws && this.connections.get(serverId) !== ws) return;
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
   * Rejects if the agent doesn't respond within timeoutMs, or if the agent
   * replies with agent:error / a failed file-op result.
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
        reject(new Error(`Agent did not respond within ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (responsePayload) => {
          clearTimeout(timer);
          this.pending.delete(requestId);
          resolve(responsePayload as TResponse);
        },
        reject: (err) => {
          clearTimeout(timer);
          this.pending.delete(requestId);
          reject(err);
        },
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
   * Route incoming agent messages: resolve/reject pending requests,
   * handle heartbeats and unsolicited system info.
   */
  handleAgentMessage(serverId: string, msg: WSMessage): void {
    const payload = msg.payload as Record<string, unknown>;
    const requestId = payload?.requestId as string | undefined;

    if (requestId && this.pending.has(requestId)) {
      const entry = this.pending.get(requestId)!;

      // Agent reported an error for this request — reject, don't resolve.
      if (msg.type === 'agent:error') {
        const message = typeof payload.message === 'string' ? payload.message : 'Agent error';
        entry.reject(new Error(message));
        return;
      }

      // System info responses are also persisted, not just resolved
      if (msg.type === 'agent:system-info') {
        this.handleSystemInfo(serverId, msg.payload as Parameters<typeof this.handleSystemInfo>[1]);
      }

      entry.resolve(msg.payload);
      return;
    }

    if (msg.type === 'agent:heartbeat') {
      updateServerOnlineStatus(serverId, true).catch(() => {});
      return;
    }

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

    if (msg.type === 'agent:error') {
      console.error(`[CM] Agent error from ${serverId}:`, msg.payload);
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
    disks?: DiskInfo[];
  }): void {
    const disks = info.disks || [];
    const diskUsage: ServerDiskInfo = {
      totalGb: disks.reduce((sum, d) => sum + d.totalGb, 0),
      usedGb: disks.reduce((sum, d) => sum + d.usedGb, 0),
      freeGb: disks.reduce((sum, d) => sum + d.freeGb, 0),
    };

    updateServerSystemInfo(serverId, {
      os: info.os,
      diskUsage,
    }).catch((err) => console.error('[CM] Failed to update server system info:', err));
  }

  private startSystemInfoPolling(serverId: string): void {
    this.stopSystemInfoPolling(serverId);
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
    } catch {
      // Ignore — agent might be busy; next poll will retry
    }
  }
}

const globalForConnectionManager = globalThis as unknown as {
  connectionManager: ConnectionManager | undefined;
};

export const connectionManager =
  globalForConnectionManager.connectionManager ?? new ConnectionManager();

// ALWAYS cache on globalThis — the custom server (tsx) and the Next-bundled
// API routes are separate module graphs in the same process. Without this,
// production API routes would see a different (empty) ConnectionManager and
// every server would appear offline.
globalForConnectionManager.connectionManager = connectionManager;
