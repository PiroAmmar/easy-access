# Easy Access

Access the files on your own computers from anywhere, through a private web dashboard.

The project is split into two independent folders:

| Folder   | What it is | Where it runs |
|----------|------------|---------------|
| `hub/`   | The web dashboard (Next.js + PostgreSQL + WebSocket server) | **Railway** (or any Node host) |
| `agent/` | A small service that shares selected folders with the hub | **Your computer** (the machine whose files you want to access) |

The agent connects **outbound** to the hub over WebSocket, so you never need to open ports or configure your home router.

```
Your browser ──HTTPS──▶ Hub (Railway) ◀──WSS── Agent (your PC) ──▶ your files
```

**👉 New here? Follow [DEPLOYMENT.md](DEPLOYMENT.md) for a step-by-step guide from zero to browsing your files.**

## Quick reference

### Hub — local development

```bash
cd hub
npm install
docker compose up -d          # PostgreSQL on port 5434
cp .env.local.example .env.local   # then edit values
npm run dev                   # http://localhost:3000
```

Migrations and the admin account (from `ADMIN_USERNAME` / `ADMIN_PASSWORD`) are applied automatically on startup.

### Hub — Railway

1. Add a **PostgreSQL** database to your Railway project.
2. Create a service from this repo with **Root Directory = `hub`**.
3. Set variables: `DATABASE_URL` (reference the Postgres service), `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
4. Generate a public domain. Done — the app migrates and seeds itself on boot.

See `hub/.env.local.example` for what every variable means.

### Agent — on each computer you want to access

```bash
cd agent
npm install
npm start
```

Then open **http://localhost:4400** in your browser and fill in:
- **Hub WebSocket URL** — `wss://<your-hub-domain>/ws`
- **Agent Token** — created in the hub dashboard (Servers → Add Server)
- **Shared folders** — the only folders the hub will be able to access

The page shows live connection status and logs. Settings are stored in `~/.easy-access-agent/config.json` (you never need to edit it by hand).

## Security model

- Single admin account; every API route requires a session.
- Each agent has a unique 256-bit token; the hub rejects unknown tokens.
- The agent only serves paths inside its configured shared folders (`validatePath` — no `../` traversal, symlinks resolved, case-insensitive on Windows).
- No shell execution, no recursive deletes, 50 MB per-file limit.
- The agent's setup UI binds to `127.0.0.1` only.
