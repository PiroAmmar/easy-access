// apps/web/lib/ws-server.ts
// WebSocket server — hub side.
// Stubs for Phase 1. Full implementation in Phase 2.
// IMPORTANT: This file must only be imported from server.ts — NOT from Next.js API routes.

import type { Server as HttpServer } from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { connectionManager } from './connection-manager';
import { getServerByToken, updateServerAllowedDirs } from '@/db/queries';
import type { WSMessage, MessageType } from '@easy-access/shared';

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

export function createWsServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let serverId: string | null = null;

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
          const { token, allowedDirs } = msg.payload as { token: string; agentVersion: string; allowedDirs?: string[] };

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

            if (Array.isArray(allowedDirs)) {
              await updateServerAllowedDirs(server.id, allowedDirs);
              server.allowedDirs = allowedDirs;
            }

            connectionManager.register(server.id, ws);
            sendToWs(ws, 'hub:auth-ok', {
              serverId: server.id,
              serverName: server.name,
            });

            console.log(`[WS] Agent authenticated: ${server.name} (${server.id})`);
          } catch (err) {
            console.error('[WS] Auth handler error:', err);
            sendToWs(ws, 'hub:auth-reject', {});
            if (ws.readyState === WebSocket.OPEN) ws.close(4004, 'Server error during auth');
          }
          return;
        }

        // Route authenticated agent messages (Phase 2)
        if (serverId) {
          connectionManager.handleAgentMessage(serverId, msg);
        }
      } catch (fatalErr) {
        console.error('[WS] Fatal error in message handler:', fatalErr);
      }
    });

    ws.on('close', () => {
      if (serverId) {
        connectionManager.unregister(serverId);
        console.log(`[WS] Agent disconnected: ${serverId}`);
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[WS] Socket error:', err);
    });
  });

  console.log('[WS] WebSocket server created at /ws');
}
