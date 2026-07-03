// apps/web/app/api/ws/route.ts
// WebSocket upgrade endpoint — handled by custom server (server.ts).
// This route exists for documentation and Next.js route discovery.
// The actual WebSocket server is attached to the HTTP server in server.ts at path '/ws'.

import { NextRequest } from 'next/server';

export const GET = async (_req: NextRequest) => {
  return new Response(
    JSON.stringify({
      message: 'WebSocket endpoint is at ws://<host>/ws',
      info: 'Use the custom server (server.ts) for WebSocket connections. This HTTP endpoint is for documentation only.',
    }),
    {
      status: 426, // Upgrade Required
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
      },
    }
  );
};