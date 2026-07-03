# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Also read `AGENTS.md` — it contains binding project rules (database, security, UI).

## Layout

Two independent, self-contained folders (no monorepo tooling, plain npm):

- **`hub/`** — Next.js 15 dashboard + WebSocket server + PostgreSQL. Deployed to Railway (Root Directory = `hub`, config in `hub/railway.toml`). Shared protocol/types live in `hub/shared/`, aliased as `@easy-access/shared` via tsconfig paths.
- **`agent/`** — Node service run on the user's machines. Has its own copy of the shared code in `agent/src/shared/` (imported relatively). Serves a setup/status UI on `http://localhost:4400` (binds 127.0.0.1 only) that writes `~/.easy-access-agent/config.json`.

The two `shared` copies (protocol.ts, types.ts, utils.ts) must be kept in sync manually when the WebSocket protocol changes.

## Commands

```bash
# Hub
cd hub
npm install
docker compose up -d      # Postgres on host port 5434 (5433 is taken by a native install on this machine)
cp .env.local.example .env.local   # complete env docs are in this file
npm run dev               # tsx watch server.ts → http://localhost:3000
npm run build             # next build (required before production start)
npm run start             # production: NODE_ENV=production tsx server.ts
npm run type-check        # tsc --noEmit
npm run migrate / seed    # manual CLI; both also run automatically on server startup

# Agent
cd agent
npm install
npm start                 # tsx src/index.ts → UI at http://localhost:4400
npm run type-check
```

There are no automated tests. Verify changes end-to-end: start Postgres + hub, start agent, configure via `POST http://localhost:4400/api/config`, then exercise `/api/files` with an authenticated session.

## Architecture

```
Browser → Next.js hub (API routes) → ConnectionManager → WebSocket /ws → Agent → filesystem
```

- `hub/server.ts` is a **custom server** (App Router can't upgrade WebSockets). Boot order: `next()` prepare (loads .env.local) → `lib/bootstrap.ts` (migrations + admin upsert from `ADMIN_USERNAME`/`ADMIN_PASSWORD`) → attach `lib/ws-server.ts` at `/ws` → listen.
- `lib/connection-manager.ts` maps `serverId → WebSocket` and pairs hub→agent requests with responses by `requestId`; `agent:error` responses **reject** the pending promise. Every message is a `WSMessage<T>` (`hub/shared/protocol.ts`), types namespaced `agent:*` / `hub:*`.
- **CRITICAL**: the ConnectionManager and pg Pool are cached on `globalThis` unconditionally. The tsx-loaded server and the Next-bundled API routes are separate module graphs in one process — removing that caching breaks production (all servers appear offline). Do not "clean it up".
- Auth: NextAuth v5 Credentials, JWT sessions, single admin. `middleware.ts` guards everything except `/api/auth` and `/api/health` (the Railway healthcheck).
- DB: raw `pg`, single pool in `lib/db.ts`, all queries parameterized in `db/queries.ts`, numbered SQL migrations in `db/migrations/` tracked in a `_migrations` table.
- Agent security: every path goes through `validatePath()` (`agent/src/security.ts`) — resolves symlinks, case-insensitive comparison on win32, no recursive deletes, 50 MB file cap, Node `fs` only (never shell).

## Conventions

- API route responses: `{ success: boolean, data?: T, error?: string }`.
- SQL snake_case ↔ TypeScript camelCase via `AS "camelCase"` aliases.
- Vanilla CSS only (tokens in `hub/styles/globals.css`), no Tailwind.
- Server components by default; `"use client"` only when interactive.
- Never log agent tokens.
