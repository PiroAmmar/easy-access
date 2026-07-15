// hub/lib/ws-server.ts
// WebSocket server — hub side. Agents connect here at /ws and authenticate
// with their per-server token before any other message is accepted.
// IMPORTANT: This file must only be imported from server.ts — NOT from Next.js API routes.

import type { Server as HttpServer } from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { connectionManager } from './connection-manager';
import { getServerByToken } from '@/db/queries';
import type { WSMessage, MessageType } from '@easy-access/shared';

const PING_INTERVAL_MS = 30_000;

function sendToWs<T>(ws: WebSocket, type: MessageType, payload: T): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
    })
  );
}

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
}

export function createWsServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Protocol-level ping/pong so half-dead connections (killed WiFi, proxy
  // drops) are detected and cleaned up instead of lingering as "online".
  const pingTimer = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as TrackedSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(pingTimer));

  wss.on('connection', (ws: TrackedSocket) => {
    let serverId: string | null = null;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Auth deadline — close unauthenticated connections after 10s
    const authDeadline = setTimeout(() => {
      if (!serverId) {
        ws.close(4001, 'Auth timeout');
      }
    }, 10_000);

    ws.on('message', async (data: import('ws').RawData) => {
      try {
        let msg: WSMessage;

        try {
          msg = JSON.parse(data.toString()) as WSMessage;
        } catch {
          if (ws.readyState === WebSocket.OPEN) ws.close(4000, 'Invalid JSON');
          return;
        }

        // Only allow agent:auth before authentication completes
        if (!serverId && msg.type !== 'agent:auth') {
          if (ws.readyState === WebSocket.OPEN) ws.close(4002, 'Not authenticated');
          return;
        }

        if (msg.type === 'agent:auth') {
          const { token } = msg.payload as { token: string; agentVersion: string; allowedDirs?: string[] };

          if (!token || typeof token !== 'string' || token.length < 10) {
            if (ws.readyState === WebSocket.OPEN) ws.close(4003, 'Invalid token format');
            return;
          }

          try {
            const server = await getServerByToken(token).catch((err) => {
              console.error('[WS] Database error verifying token:', err);
              return null;
            });

            if (!server) {
              await new Promise((r) => setTimeout(r, 500));
              sendToWs(ws, 'hub:auth-reject', {});
              if (ws.readyState === WebSocket.OPEN) ws.close(4003, 'Invalid token');
              return;
            }

            clearTimeout(authDeadline);
            serverId = server.id;

            // The hub dashboard is the single source of truth for allowed
            // directories — the agent's own local config is never trusted
            // to set or change this. We only push our DB value down to it.
            connectionManager.register(server.id, ws);
            sendToWs(ws, 'hub:auth-ok', {
              serverId: server.id,
              serverName: server.name,
              allowedDirs: server.allowedDirs ?? [],
            });

            console.log(`[WS] Agent authenticated: ${server.name} (${server.id})`);
          } catch (err) {
            console.error('[WS] Auth handler error:', err);
            sendToWs(ws, 'hub:auth-reject', {});
            if (ws.readyState === WebSocket.OPEN) ws.close(4004, 'Server error during auth');
          }
          return;
        }

        // Route authenticated agent messages
        if (serverId) {
          connectionManager.handleAgentMessage(serverId, msg);
        }
      } catch (fatalErr) {
        console.error('[WS] Fatal error in message handler:', fatalErr);
      }
    });

    ws.on('close', () => {
      clearTimeout(authDeadline);
      if (serverId) {
        connectionManager.unregister(serverId, ws);
        console.log(`[WS] Agent disconnected: ${serverId}`);
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[WS] Socket error:', err);
    });
  });

  console.log('[WS] WebSocket server created at /ws');
}
