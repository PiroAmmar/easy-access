// hub/server.ts
// Custom Next.js server — required because App Router cannot upgrade WebSocket
// connections in route handlers. The WebSocket server is attached to the
// underlying HTTP server before Next.js handles any requests.
//
// Startup order:
//   1. next() prepares the app (this also loads .env.local into process.env)
//   2. bootstrap() applies DB migrations and ensures the admin account
//   3. WebSocket server is attached at /ws
//   4. HTTP server starts listening

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(async () => {
    // Import lazily so env vars loaded by next() are visible to the DB pool
    const { bootstrap } = await import('./lib/bootstrap');
    const { createWsServer } = await import('./lib/ws-server');

    await bootstrap();

    const httpServer = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url!, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('[Server] Error handling request:', err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });

    // Attach WebSocket server BEFORE listening
    createWsServer(httpServer);

    httpServer.listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> WebSocket server attached at ws://${hostname}:${port}/ws`);
    });

    httpServer.on('error', (err: Error) => {
      console.error('[Server] HTTP server error:', err);
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  });
