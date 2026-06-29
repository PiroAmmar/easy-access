# CRITICAL RULES - MUST FOLLOW

## RESPONSES

- Keep responses concise and to the point - unless the user asks otherwise

## PLANNING MODE

- Always ask clarifying questions
- Never assume design, tech stack or features
- Use deep-dive sub-agents to assist with research
- Use deep-dive sub-agents to review the different aspects of your plan before presenting to the user

## CHANGE / EDIT MODE

- Never implement features yourself when possible - use sub-agents!
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently
- When using sub-agents to implement features, act as a coordinator only
- Use the best model for the task - premium models for complex tasks (like coding) and mid-tier models for simpler tasks, like documentation
- After completing features (large or small), always run commands like lint, type check and next build to check code quality

## DATABASE

- NEVER use Prisma or any ORM — raw `pg` (node-postgres) only
- NEVER interpolate user input into SQL strings — always use `$1, $2, ...` placeholders
- Always use the shared pool from `apps/web/lib/db.ts` — never create a new Pool
- Use snake_case in SQL, camelCase in TypeScript. Bridge via `AS "camelCase"` aliases in SELECT
- See `.agents/skills/pg-patterns/SKILL.md` for all query patterns

## SECURITY (NON-NEGOTIABLE)

- NEVER allow `../` or path traversal in file operations
- ALL file paths must be resolved against the server's `allowedDirs` via `validatePath()`
- Agent tokens are unique per server, required for WebSocket auth, NEVER logged
- File content is limited to 50 MB — always check size before reading
- NEVER use shell commands (exec/spawn) for file operations — Node.js `fs` only
- NEVER recursive delete (`rmSync({ recursive: true })`) — only files and empty dirs
- See `.agents/skills/agent-security/SKILL.md` for the full `validatePath()` implementation

## TESTING

- Use any testing tools, libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- If the project does not have any testing tools, scripts, MCP tools, skills, etc. available for testing, ask the user whether testing should be skipped.

## UI DESIGN

- Always follow the UI design system when creating or reviewing components or pages.
- Use: @.agents/skills/design-taste-frontend, @.agents/skills/emil-design-eng, @.agents/skills/impeccable
- When creating new components, first check if there is an existing component that can be used
- CSS: Vanilla CSS only. No Tailwind. All tokens are in `apps/web/styles/globals.css`

---

# Easy Access — Agent Instructions

## Project Overview

Easy Access is a **self-hosted remote server/PC data management platform**.
- Single admin, 2–5 connected machines, mixed LAN + internet topology
- The admin can browse, upload, download, and preview files on remote machines via a web dashboard
- Reference plan: `Plan.md` at the project root

## Components

1. **Central Hub** (`apps/web`) — Next.js 15 App Router full-stack app
2. **Remote Agent** (`apps/agent`) — Node.js TypeScript service on each remote machine
3. **Shared Package** (`packages/shared`) — Types, protocol, utilities shared by both

## Architecture

```
Browser → Next.js Hub → WebSocket Server → Agent → filesystem
```

- Monorepo: pnpm workspaces + Turborepo
- Agents connect **OUTBOUND** to the hub via WebSocket (wss://)
- Hub exposed via port forwarding on admin's network
- All file operations flow: Browser → Hub API → WebSocket → Agent → filesystem
- Database: PostgreSQL via node-postgres (raw SQL, parameterized queries)
- Auth: NextAuth.js v5 with Credentials provider (single admin)

## Code Standards

- **TypeScript strict mode** in all 3 packages
- **API responses**: `{ success: boolean, data?: T, error?: string }`
- **WebSocket messages**: follow `packages/shared/src/protocol.ts` schema
- **Next.js**: Server components by default, client only when interactive
- **CSS**: Vanilla CSS with design tokens in `apps/web/styles/globals.css`
- **Imports**: Use `@/` alias for `apps/web/`, `@easy-access/shared` for shared package

## Project Structure

```
easy-access/
├── apps/
│   ├── web/                          # Next.js central hub
│   │   ├── app/                      # App Router pages
│   │   ├── components/               # React components
│   │   ├── lib/
│   │   │   ├── auth.ts               # NextAuth v5 config
│   │   │   ├── db.ts                 # PostgreSQL pool (single pool)
│   │   │   ├── ws-server.ts          # WebSocket server
│   │   │   └── connection-manager.ts # Track connected agents
│   │   ├── db/
│   │   │   ├── schema.sql            # DDL — CREATE TABLE statements
│   │   │   ├── queries.ts            # All typed query functions
│   │   │   ├── migrate.ts            # Migration runner
│   │   │   └── migrations/           # Numbered SQL migration files
│   │   ├── styles/
│   │   │   └── globals.css           # Design tokens + reset
│   │   └── server.ts                 # Custom Next.js server (WebSocket)
│   │
│   └── agent/                        # Remote agent
│       └── src/
│           ├── index.ts              # Entry point
│           ├── connection.ts         # WebSocket client → hub
│           ├── file-ops.ts           # Secure file system operations
│           ├── security.ts           # validatePath() — MANDATORY
│           └── config.ts             # Agent config (~/.easy-access-agent/config.json)
│
└── packages/
    └── shared/                       # Shared types and protocol
        └── src/
            ├── types.ts              # Server, File, Activity, Admin types
            ├── protocol.ts           # WSMessage<T> and all message types
            └── utils.ts              # formatBytes, getMimeType, etc.
```

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

## File Operation Safety Pattern

```typescript
// ALWAYS use validatePath before any fs operation in the agent
import { validatePath, SecurityError } from './security';

const safePath = validatePath(userProvidedPath, config.allowedDirs);
// Now it's safe to use safePath with fs
```

## WebSocket Auth Flow

```
Agent                          Hub
  |--- agent:auth (token) ------->|
  |<-- hub:auth-ok (serverId) ----|   ← connection registered
  |--- agent:heartbeat (30s) ---->|   ← loop forever
  |<-- hub:list-dir (requestId) --|
  |--- agent:file-list ---------->|
```

## Running Commands

```bash
# Install dependencies
pnpm install

# Start hub (development)
pnpm --filter @easy-access/web dev

# Start agent (development)
pnpm --filter @easy-access/agent dev

# Run migrations
npx ts-node --project apps/web/tsconfig.server.json apps/web/db/migrate.ts

# Type check all packages
pnpm type-check
```