# Easy Access — Implementation Plan

> **Status:** Approved. Phase 1 execution in progress.
> **Last updated:** 2026-06-06
> **Reference skills:** `.agents/skills/websocket-protocol`, `.agents/skills/pg-patterns`, `.agents/skills/agent-security`

---

## Decisions Locked In

| Decision | Answer | Impact |
|---|---|---|
| **Deployment** | Self-hosted with traditional port forwarding | Hub runs on a local machine, exposed via port forward. No cloud vendor lock-in. |
| **Agent access** | Agents connect via a provided secure IP/URL | Agents on remote machines connect outbound to the hub's public IP. |
| **Scale** | 2–5 machines | No need for message queues or horizontal scaling. Simple in-memory connection manager. |
| **Document handling** | View-only first, editing later | Phase 1 uses read-only preview libs. Reduces complexity significantly. |
| **Auth** | Single admin, full access | Simple credential-based auth. No RBAC needed initially. |
| **Network** | Mixed LAN + internet | Must use TLS for internet-facing connections. LAN agents can optionally skip TLS in dev. |
| **Database** | PostgreSQL + raw `pg` (node-postgres) | No ORM — parameterized SQL queries directly. Full control. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│           CENTRAL HUB (Self-Hosted Next.js App)           │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Next.js      │  │  API Routes  │  │  WebSocket      │  │
│  │  Dashboard    │  │  /api/*      │  │  Server (ws)    │  │
│  │  (React 19)   │  │              │  │                 │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                 │                    │            │
│  ┌──────┴─────────────────┴────────────────────┴────────┐  │
│  │                 Core Services                         │  │
│  │  • Auth (NextAuth.js v5 — Credentials provider)       │  │
│  │  • Server Registry (PostgreSQL via pg)                │  │
│  │  • Connection Manager (in-memory Map<id, ws>)         │  │
│  │  • File Operation Proxy                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                ┌─────────┴──────────┐                        │
│                │  PostgreSQL DB      │                        │
│                │  (via node-postgres)│                        │
│                └────────────────────┘                         │
└────────────────────────┬─────────────────────────────────────┘
                         │
              Outbound WebSocket (wss://)
              Agents connect TO the hub
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐
     │ Agent 1  │  │ Agent 2  │  │ Agent 3  │
     │ Win PC   │  │ Linux    │  │ Win PC   │
     │          │  │ Server   │  │          │
     └──────────┘  └──────────┘  └──────────┘
```

### Data Flow

1. Admin logs into the hub dashboard via browser
2. Hub shows all registered servers and their online/offline status
3. Admin browses files → hub sends a WebSocket message to the agent
4. Agent reads the local filesystem, sends file listing back over WebSocket
5. Admin clicks a file → agent reads content → hub streams it to browser
6. Browser renders preview using client-side libraries (SheetJS, mammoth.js, PDF.js)

### Why Agents Connect Outbound

- No need to open ports on remote machines
- Works through NAT and firewalls
- Only the hub needs a public IP / port forward
- Agents just need to know the hub's address

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Monorepo** | pnpm workspaces + Turborepo | Clean separation of web, agent, shared code |
| **Frontend** | Next.js 15 (App Router) + React 19 | Full-stack, SSR, API routes in one project |
| **Styling** | Vanilla CSS with design tokens | Per existing skills — premium aesthetic |
| **State** | Zustand | Lightweight store for connection + file browser state |
| **Real-time** | `ws` (server) + native WebSocket (agent) | No Socket.IO overhead needed at this scale |
| **Database** | PostgreSQL via `pg` (node-postgres) | Raw SQL, full control, production-grade RDBMS |
| **Auth** | NextAuth.js v5 (Credentials provider) | Single admin — simple username/password |
| **Agent Runtime** | Node.js (TypeScript) | Cross-platform, same language as hub |
| **Doc Preview** | SheetJS, mammoth.js, react-pdf, Monaco Editor | One lib per doc type, all client-side |
| **Agent Packaging** | `pkg` or `esbuild` bundle | Distribute agent as a single executable |

---

## Project Structure

```
easy-access/
├── apps/
│   ├── web/                          # Next.js central hub
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   └── login/page.tsx    # Admin login
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx        # Dashboard shell (sidebar, topbar)
│   │   │   │   ├── page.tsx          # Overview / home
│   │   │   │   ├── servers/
│   │   │   │   │   ├── page.tsx      # Server list + status
│   │   │   │   │   └── [id]/page.tsx # Single server detail
│   │   │   │   ├── files/
│   │   │   │   │   └── [...path]/page.tsx  # File browser
│   │   │   │   └── preview/
│   │   │   │       └── page.tsx      # Document preview
│   │   │   ├── api/
│   │   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   │   ├── servers/route.ts
│   │   │   │   ├── files/route.ts
│   │   │   │   └── ws/route.ts       # WebSocket upgrade
│   │   │   └── layout.tsx            # Root layout
│   │   ├── components/
│   │   │   ├── ui/                   # Design system primitives
│   │   │   ├── file-browser/         # File tree, grid view
│   │   │   ├── preview/              # Document viewers
│   │   │   └── server/               # Server cards, status
│   │   ├── lib/
│   │   │   ├── ws-server.ts          # WebSocket server logic
│   │   │   ├── connection-manager.ts # Track connected agents
│   │   │   ├── auth.ts               # NextAuth config
│   │   │   └── db.ts                 # PostgreSQL pool (pg)
│   │   ├── styles/
│   │   │   ├── globals.css           # Design tokens + reset
│   │   │   └── components/           # Component-specific CSS
│   │   ├── db/
│   │   │   ├── schema.sql            # DDL — CREATE TABLE statements
│   │   │   ├── migrations/           # Numbered SQL migration files
│   │   │   └── queries.ts            # Typed query helper functions
│   │   ├── server.ts                 # Custom Next.js server (required for WebSocket)
│   │   └── package.json
│   │
│   └── agent/                        # Remote agent
│       ├── src/
│       │   ├── index.ts              # Entry point — start agent
│       │   ├── connection.ts         # WebSocket client → hub
│       │   ├── file-ops.ts           # File system operations
│       │   ├── system-info.ts        # OS, disk, memory reporting
│       │   ├── security.ts           # Path validation, sandboxing
│       │   └── config.ts             # Agent config (hub URL, allowed dirs, token)
│       ├── scripts/
│       │   ├── install-win.ps1       # Windows service installer
│       │   └── install-linux.sh      # Linux systemd installer
│       └── package.json
│
├── packages/
│   └── shared/                       # Shared between web + agent
│       ├── src/
│       │   ├── types.ts              # Server, File, User types
│       │   ├── protocol.ts           # WebSocket message schemas
│       │   └── utils.ts              # Path sanitization, formatting
│       └── package.json
│
├── .agents/skills/                   # Custom + installed skills
│   ├── websocket-protocol/           # ✅ Created
│   ├── pg-patterns/                  # ✅ Created
│   ├── agent-security/               # ✅ Created
│   └── ...                           # Design/UI skills
├── AGENTS.md                         # Project-wide agent instructions
├── Plan.md                           # This file
├── package.json                      # Monorepo root
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Database Schema (PostgreSQL — Raw SQL)

```sql
-- apps/web/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE servers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  agent_token  VARCHAR(255) UNIQUE NOT NULL,
  allowed_dirs JSONB NOT NULL DEFAULT '[]',   -- Array of allowed directory paths
  last_seen    TIMESTAMPTZ,
  is_online    BOOLEAN NOT NULL DEFAULT FALSE,
  os           VARCHAR(50),
  disk_usage   JSONB,                          -- { totalGb, usedGb, freeGb }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE activities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       VARCHAR(50) NOT NULL,              -- 'file_read', 'file_write', etc.
  path       TEXT NOT NULL,
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_server_id ON activities(server_id);
CREATE INDEX idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX idx_servers_agent_token ON servers(agent_token);
```

**Key patterns:** See `.agents/skills/pg-patterns/SKILL.md` for query helpers, migration runner, and all pre-written CRUD functions.

---

## WebSocket Protocol

All messages follow this schema (see `.agents/skills/websocket-protocol/SKILL.md` for full details):

```typescript
interface WSMessage<T = unknown> {
  id: string;        // UUID — correlates requests with responses
  type: MessageType; // See full list in skill
  payload: T;
  timestamp: number; // Date.now()
}
```

**Message flow:** Agent → `agent:auth` → Hub → `hub:auth-ok` → Agent starts heartbeat (30s interval) → Hub sends `hub:list-dir` / `hub:read-file` etc. → Agent responds with `agent:file-list` / `agent:file-content`.

> ⚠️ Next.js App Router does NOT support WebSocket upgrades in route handlers. A custom `server.ts` is required — see skill for implementation.

---

## Security Rules (NON-NEGOTIABLE)

See `.agents/skills/agent-security/SKILL.md` for the full `validatePath()` implementation and all secure file operation functions.

1. **NEVER allow `../` or path traversal** — `validatePath()` must be called before every `fs` operation
2. **ALL file paths** must be resolved against the server's `allowedDirs`
3. **Agent tokens** are unique per server, required for WebSocket auth, never logged
4. **50 MB hard limit** on file reads — check size before buffering
5. **No shell commands** (`exec`/`spawn`) for file operations — Node.js `fs` module only
6. **No recursive delete** — only files and empty directories

---

## Skills Available

| Skill | Trigger | Purpose |
|---|---|---|
| `websocket-protocol` | WebSocket, ws server, agent connection, heartbeat | Full protocol spec + connection lifecycle |
| `pg-patterns` | database, SQL, query, postgres, migration | Connection pool, query helpers, all CRUD patterns |
| `agent-security` | file path, allowed dirs, agent token, path traversal | `validatePath()`, secure file ops, token validation |
| `design-taste-frontend` | UI design, dashboard, components | Premium frontend aesthetics |
| `impeccable` | redesign, audit, polish, UI | UI quality review |
| `emil-design-eng` | animations, micro-interactions, motion | UI polish and motion |
| `full-output-enforcement` | complete code, no truncation | Enforce complete output |

---

## Phased Execution Roadmap

### Phase 1: Scaffolding & Foundation
- [ ] Initialize monorepo (pnpm-workspace.yaml, turbo.json, root package.json)
- [ ] Scaffold Next.js 15 app in `apps/web/`
- [ ] Create `packages/shared/` with types and protocol
- [ ] Set up PostgreSQL with raw `pg` — schema.sql, migrations, query helpers
- [ ] Set up NextAuth.js with credentials provider
- [ ] Write AGENTS.md with full project context
- [ ] Create base CSS design system (tokens, reset, typography)

### Phase 2: WebSocket Infrastructure
- [ ] Custom Next.js server (`server.ts`) for WebSocket support
- [ ] WebSocket server in the hub (`lib/ws-server.ts`)
- [ ] Connection manager (`lib/connection-manager.ts`)
- [ ] Agent WebSocket client with exponential backoff reconnect
- [ ] Agent authentication flow (token → `hub:auth-ok`)
- [ ] Heartbeat (30s interval) + server online/offline DB updates
- [ ] Shared protocol message handlers

### Phase 3: Agent File Operations
- [ ] `list-dir` with `validatePath` security
- [ ] `read-file` with 50 MB size check (base64 response)
- [ ] `write-file` (upload from hub)
- [ ] `delete-file` and `move-file`
- [ ] System info reporting (OS, disk, memory)
- [ ] Agent CLI setup command (`easy-access-agent setup`)

### Phase 4: Dashboard UI
- [ ] Dashboard layout shell (sidebar nav, topbar, content area)
- [ ] Server management page (add/remove/edit servers, connection status)
- [ ] File browser (tree sidebar + file grid, breadcrumb navigation)
- [ ] Upload/download UI with progress indicators
- [ ] File context menu (rename, move, delete)
- [ ] Real-time connection status (online/offline indicators)

### Phase 5: Document Preview
- [ ] Excel preview — SheetJS (read-only table)
- [ ] Word preview — mammoth.js (HTML render)
- [ ] PDF viewer — react-pdf
- [ ] Image viewer with zoom/pan
- [ ] Text/code viewer with syntax highlighting
- [ ] Preview modal/page with file metadata sidebar

### Phase 6: Polish & Deployment
- [ ] Premium animations and page transitions
- [ ] Error states and empty states
- [ ] Responsive design
- [ ] Agent install scripts (PowerShell / bash)
- [ ] Activity log page
- [ ] Deployment guide (port forwarding, TLS setup)

---

## Verification Plan

```bash
# Run all tests
pnpm --filter @easy-access/shared test    # Protocol & type tests
pnpm --filter @easy-access/agent test     # File ops with mock FS
pnpm --filter @easy-access/web test       # API route tests
pnpm --filter @easy-access/web test:e2e   # Playwright E2E
```

### Manual Verification Checklist
1. Start hub, port forward to public IP
2. Install agent on a second machine, configure hub URL + token
3. Verify agent connects → appears online in dashboard
4. Browse files on remote machine from dashboard
5. Upload a file, download it back, verify integrity (checksum match)
6. Preview `.xlsx`, `.docx`, `.pdf`, `.png`, `.txt` files
7. Attempt path traversal (`../../etc/passwd`) → verify blocked
8. Kill agent process → dashboard shows offline within 35s (heartbeat timeout)
