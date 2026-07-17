# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Easy Access** is a self-hosted remote file browser. A **hub** (Next.js web app) runs in the cloud (Railway), and a lightweight **agent** runs locally on machines whose files you want to access. The agent connects outbound over WebSocket to the hub — no port-forwarding needed.

```
Browser ──HTTPS──▶ Hub (Railway/Next.js) ◀──WSS── Agent (local machine) ──▶ files
```

## Repository Structure

```
hub/    Next.js app + custom HTTP/WebSocket server (deployed to Railway)
agent/  Lightweight file-serving daemon (run locally on each machine)
```

Both are independent Node.js packages. There is no monorepo tool — work in each folder separately.

## Commands

### Hub (cd hub)

```bash
npm install
docker compose up -d          # Postgres on port 5434 (avoids native Postgres conflict on 5433)
cp .env.local.example .env.local   # Edit values
npm run dev                   # Development server at http://localhost:3000
npm run build                 # Production build
npm run type-check            # tsc --noEmit
npm run lint                  # Next.js ESLint
npm run migrate               # Run DB migrations manually
```

### Agent (cd agent)

```bash
npm install
npm start                     # Run agent (setup UI at http://localhost:4400)
npm run dev                   # tsx watch mode
npm run type-check            # tsc --noEmit
```

## Architecture

### Hub

- **`server.ts`** — Custom HTTP server entry point. Next.js App Router cannot upgrade WebSocket connections from route handlers, so this file creates the HTTP server, runs `bootstrap()` (migrations + admin account), attaches the WebSocket server at `/ws`, then starts listening. Always start the hub via `tsx server.ts` / `npm run dev`, not `next dev`.
- **`lib/ws-server.ts`** — WebSocket server (hub side). Agents connect here; must authenticate with `agent:auth` within 10 s or connection is closed. Import only from `server.ts` — never from Next.js API routes.
- **`lib/connection-manager.ts`** — In-memory singleton stored on `globalThis` to bridge the gap between the tsx module graph (server.ts) and Next.js's bundled API-route module graph. Without `globalThis` caching, API routes would see a separate, empty `ConnectionManager` and every agent would appear offline. Tracks live agent WebSockets and pairs async request/response via `requestId` UUIDs.
- **`lib/bootstrap.ts`** — Idempotent startup: waits for DB, runs SQL migrations from `db/migrations/`, and upserts the admin account from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars.
- **`db/`** — `queries.ts` for typed DB access, `migrations/` for numbered SQL files (applied in alphabetical order), `schema.sql` as reference.
- **`app/api/`** — Next.js route handlers for REST operations; they call `connectionManager.request()` to proxy file operations to the agent over WebSocket.
- **`lib/stores/`** — Zustand stores for client-side state (file listing, server list, feedback).

### Agent

- **`src/index.ts`** — Entry point; starts the UI server and connection manager.
- **`src/connection.ts`** — WebSocket client that connects to the hub, handles auth and message routing.
- **`src/ui-server.ts`** — Local HTTP server on `127.0.0.1:4400` for one-time setup (token, hub URL, shared folders). Binds localhost-only.
- **`src/config.ts`** — Reads/writes `~/.easy-access-agent/config.json`.
- **`src/file-ops.ts`** — Handles all file operations (list, read, write, delete, move, mkdir) with size limits (50 MB max).
- **`src/security.ts`** — `validatePath()`: resolves symlinks, enforces that the requested path stays inside the configured shared folders; no `../` traversal, case-insensitive on Windows.
- **`src/shared/`** — Shared protocol types copied/symlinked from the hub. `protocol.ts` defines all `WSMessage` types; `types.ts` defines `FileEntry`, `DiskInfo`, etc.

### WebSocket Protocol

All messages follow `WSMessage<T>` with `{ id, type, payload, timestamp }`. Message types are prefixed `agent:` (agent → hub) or `hub:` (hub → agent). Request/response pairing uses a `requestId` UUID embedded in the payload. See `agent/src/shared/protocol.ts` for the full enum.

## Local Development Notes

- Postgres runs on **port 5434** (not 5433) because native Windows Postgres commonly holds 5433.
- Migrations run automatically on every hub startup — no manual migration step needed in dev.
- The hub's `connectionManager` singleton must live on `globalThis` because `server.ts` and Next.js API routes are separate module graphs in the same process.
- The hub dashboard is the sole source of truth for `allowedDirs` — the agent's local config is overwritten with the hub's value on every `hub:auth-ok`.
- `hub:allowed-dirs-update` is pushed live to connected agents when the dashboard changes shared folder config.

## Environment Variables (Hub)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://postgres:postgres@localhost:5434/easy_access` for local dev) |
| `AUTH_SECRET` | NextAuth v5 session signing key (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | Set `true` when behind Railway's proxy |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Auto-created/updated admin account on startup |
| `PORT` | Defaults to `3000` (Railway injects this automatically) |
