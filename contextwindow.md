# Easy Access — Context Window (Session State)

> **Last updated:** 2026-06-06T22:24 PKT
> **Purpose:** Restore full context if the conversation resets or tokens exhaust. Read this file FIRST before doing anything.

---

## What Is This Project?

**Easy Access** is a self-hosted remote server/PC data management platform. A single admin manages 2–5 machines via a web dashboard. Files on remote machines can be browsed, uploaded, downloaded, and previewed.

**Architecture:** `Browser → Next.js Hub → WebSocket → Agent → filesystem`

**Key docs:** `Plan.md` (full spec), `AGENTS.md` (agent rules), `.agents/skills/` (3 custom skills)

---

## Monorepo Structure

```
easy-access/
├── packages/shared/       ✅ COMPLETE
├── apps/agent/            ✅ COMPLETE
├── apps/web/              ✅ PHASES 1-5 COMPLETE (build pending verification)
│   ├── app/api/           ✅ servers/, servers/[id]/, files/, auth/
│   ├── app/dashboard/     ✅ layout, page, servers/, servers/[id]/, files/, activity/, preview/
│   ├── components/        ✅ ui/ (modal, sidebar, dashboard-shell), server/ (card, add-modal), file-browser/ (file-icon)
│   ├── lib/               ✅ db.ts, auth.ts, ws-server.ts, connection-manager.ts, stores/ (server-store, file-store)
│   ├── db/                ✅ schema.sql, migrations/, queries.ts, migrate.ts, seed.ts
│   ├── styles/            ✅ globals.css, dashboard.css, file-browser.css
│   ├── server.ts          ✅ Custom Next.js server with WebSocket
│   └── middleware.ts      ✅ NextAuth route protection
```

---

## Completed Work (ALL PHASES)

### Phase 1: Scaffolding ✅
- pnpm workspaces + turborepo
- Next.js 15 App Router, TypeScript strict
- PostgreSQL with raw `pg` — schema, migrations, typed queries
- NextAuth v5 Credentials provider
- Design system in globals.css

### Phase 2: WebSocket Infrastructure ✅
- Custom `server.ts` with WebSocket server
- `ws-server.ts` — full auth flow
- `connection-manager.ts` — request/response pairing, heartbeat, system info polling
- Agent `connection.ts` — reconnect with backoff, all message handlers
- Agent `system-info.ts` — OS, CPU, RAM, disk

### Phase 3: API Routes + File Ops ✅
- Agent file-ops (all with `validatePath`)
- Hub API: servers CRUD, files CRUD
- `db/seed.ts` — admin seeder

### Phase 4: Dashboard UI ✅
- **Zustand stores:** `lib/stores/server-store.ts`, `lib/stores/file-store.ts`
- **Layout:** `app/dashboard/layout.tsx` + `components/ui/dashboard-shell.tsx` + `components/ui/sidebar.tsx`
- **Dashboard home:** `app/dashboard/page.tsx` — stats cards, server list, recent activity
- **Server management:** `app/dashboard/servers/page.tsx` (list + add modal), `servers/[id]/page.tsx` (detail)
- **Components:** `components/server/server-card.tsx`, `components/server/add-server-modal.tsx`, `components/ui/modal.tsx`
- **File browser:** `app/dashboard/files/page.tsx` — grid/list views, breadcrumbs, context menu, upload, download
- **Activity log:** `app/dashboard/activity/page.tsx` — table with type/path/server/time
- **CSS:** `styles/dashboard.css`, `styles/file-browser.css`
- **Design system extensions:** modal, toast, skeleton, empty-state, disk-bar, copy-field styles in globals.css

### Phase 5: Preview (Lightweight) ✅
- `app/dashboard/preview/page.tsx` — images, text/code, PDFs (native), download fallback
- No heavy deps needed (xlsx/mammoth/react-pdf can be added later for richer previews)

### Phase 6: Polish — REMAINING
- [ ] `components/ui/error-state.tsx` (with retry button)
- [ ] `components/ui/loading-skeleton.tsx` (reusable)
- [ ] Page transition animations
- [ ] Mobile sidebar → hamburger drawer
- [ ] Agent install scripts (PowerShell + bash)
- [ ] `docker-compose.yml` (PostgreSQL)
- [ ] Final verification: type-check + build + full test

---

## Critical Rules (from AGENTS.md)

- **No Prisma** — raw `pg` with `$1, $2` parameterized queries only
- **No Tailwind** — vanilla CSS, tokens in `apps/web/styles/globals.css`
- **TypeScript strict** everywhere
- **`validatePath()`** before every file op in agent
- **Agent tokens never logged**
- **50 MB file size limit**
- **No shell commands** for file ops — `fs` module only
- **No recursive delete**
- After changes: `pnpm type-check` and `pnpm --filter @easy-access/web build`

---

## Design System Summary (globals.css — now ~900 lines)

- **Colors:** `--color-brand-{50-900}`, `--color-neutral-{0-950}`, semantic colors
- **Surfaces:** `--surface-bg/elevated/card/overlay/border`
- **Glass:** `--glass-bg/border/blur`
- **Typography:** Inter font, `--text-xs` to `--text-5xl`
- **Components:** `.btn-*`, `.card`, `.card-glass`, `.form-*`, `.badge-*`, `.auth-*`, `.spinner`
- **NEW in Phase 4:** `.modal-*`, `.toast-*`, `.disk-bar-*`, `.empty-state-*`, `.skeleton`, `.copy-field-*`
- **Layout (dashboard.css):** `.dashboard-layout`, `.sidebar-*`, `.topbar-*`, `.dashboard-content`, `.page-header`, `.stats-grid`, `.stat-card`
- **File Browser (file-browser.css):** `.file-grid`, `.file-card`, `.file-list`, `.breadcrumbs`, `.view-toggle`, `.context-menu`, `.upload-zone`

---

## How to Resume

1. Read this file first
2. Read `Plan.md` for full spec, `AGENTS.md` for rules
3. Run `pnpm type-check` — should pass (verified ✅)
4. Run `pnpm --filter @easy-access/web build` — verify
5. Remaining: Phase 6 (polish + deploy) only
6. Optional enhancements: richer preview (xlsx, mammoth, react-pdf), settings page

---

## File Quick Reference

| File | Status | Notes |
|---|---|---|
| `packages/shared/src/types.ts` | ✅ | Server, Activity, Admin, FileEntry, DiskInfo, ApiResponse |
| `packages/shared/src/protocol.ts` | ✅ | WSMessage, MessageTypes, payloads, WS_CLOSE_CODES |
| `packages/shared/src/utils.ts` | ✅ | formatBytes, getMimeType, formatDate, etc. |
| `apps/web/lib/db.ts` | ✅ | Single Pool, max 10 connections |
| `apps/web/lib/auth.ts` | ✅ | NextAuth v5, Credentials, JWT |
| `apps/web/lib/ws-server.ts` | ✅ | WebSocket auth + message routing |
| `apps/web/lib/connection-manager.ts` | ✅ | Request/response pairing, system info polling |
| `apps/web/lib/stores/server-store.ts` | ✅ | Zustand store for servers |
| `apps/web/lib/stores/file-store.ts` | ✅ | Zustand store for file browser |
| `apps/web/db/queries.ts` | ✅ | All CRUD queries |
| `apps/web/db/migrate.ts` | ✅ | Migration runner |
| `apps/web/db/seed.ts` | ✅ | Admin seeder |
| `apps/web/server.ts` | ✅ | Custom HTTP + WebSocket server |
| `apps/web/middleware.ts` | ✅ | Route protection |
| `apps/web/styles/globals.css` | ✅ | Full design system (~900 lines) |
| `apps/web/styles/dashboard.css` | ✅ | Layout grid, sidebar, topbar, stats |
| `apps/web/styles/file-browser.css` | ✅ | Grid, list, breadcrumbs, context menu, upload |
| `apps/web/app/layout.tsx` | ✅ | Root layout with Inter + dark mode |
| `apps/web/app/page.tsx` | ✅ | Redirect to /dashboard or /login |
| `apps/web/app/dashboard/layout.tsx` | ✅ | Sidebar + topbar shell |
| `apps/web/app/dashboard/page.tsx` | ✅ | Overview with stats + server list + activity |
| `apps/web/app/dashboard/servers/page.tsx` | ✅ | Server list + add modal |
| `apps/web/app/dashboard/servers/[id]/page.tsx` | ✅ | Server detail with system info |
| `apps/web/app/dashboard/files/page.tsx` | ✅ | File browser grid/list + upload + context menu |
| `apps/web/app/dashboard/activity/page.tsx` | ✅ | Activity table |
| `apps/web/app/dashboard/preview/page.tsx` | ✅ | Image/text/code/PDF preview |
| `apps/web/components/ui/modal.tsx` | ✅ | Reusable native dialog modal |
| `apps/web/components/ui/sidebar.tsx` | ✅ | Navigation sidebar |
| `apps/web/components/ui/dashboard-shell.tsx` | ✅ | Layout shell (sidebar + topbar + content) |
| `apps/web/components/server/server-card.tsx` | ✅ | Server card with status + disk bar |
| `apps/web/components/server/add-server-modal.tsx` | ✅ | Add server form + token reveal |
| `apps/web/components/file-browser/file-icon.tsx` | ✅ | Color-coded SVG icons per file type |
| `apps/web/app/api/servers/route.ts` | ✅ | GET list, POST create |
| `apps/web/app/api/servers/[id]/route.ts` | ✅ | GET, PUT, DELETE |
| `apps/web/app/api/files/route.ts` | ✅ | GET list/read, POST write/mkdir, DELETE, PATCH move |
| `apps/agent/src/security.ts` | ✅ | validatePath(), SecurityError |
| `apps/agent/src/file-ops.ts` | ✅ | list, read, write, delete, move, mkdir |
| `apps/agent/src/connection.ts` | ✅ | Full agent WebSocket client |
| `apps/agent/src/system-info.ts` | ✅ | OS, CPU, RAM, disk |
| `apps/agent/src/config.ts` | ✅ | loadConfig, saveConfig |
| `apps/agent/src/index.ts` | ✅ | Entry point with setup wizard |
