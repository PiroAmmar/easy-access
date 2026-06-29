# Easy Access

Easy Access is a self-hosted remote file management platform. It allows a single administrator to securely browse, upload, download, and manage files across multiple remote machines through a centralized web dashboard.

## Overview

The system consists of two parts:
1. **Central Hub (`apps/web`)**: A Next.js application that provides the web UI and a WebSocket server.
2. **Remote Agent (`apps/agent`)**: A lightweight Node.js service installed on target machines that connects *outbound* to the Hub.

Since the Agent connects outwardly via WebSockets, you **do not** need to open any incoming firewall ports on your remote machines.

---

## Quick Start (Central Hub)

You only need to run the Central Hub on **one** machine (or a cloud server).

### Prerequisites
- Node.js (v18+)
- pnpm
- Docker (for the PostgreSQL database)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start the database
docker compose up -d

# 3. Initialize the database and create the default admin account (admin / admin)
pnpm --filter @easy-access/web migrate
pnpm --filter @easy-access/web seed

# 4. Start the Hub
pnpm --filter @easy-access/web dev
```

The Hub is now running at `http://localhost:3000`. Log in with username `admin` and password `admin`.

---

## Connecting a Remote Machine

To manage files on another computer, you must install the Agent on it.

1. **Get an Agent Token**: Log into your Hub dashboard, go to **Servers**, and click **Add Server**. Enter the directories you want to share and click Create. Copy the provided Agent Token.
2. **Run the setup script on the remote machine**:
   ```bash
   npx ts-node apps/agent/src/index.ts setup
   ```
   *You will be prompted for your Hub URL (e.g., `ws://<hub-ip>:3000/ws`), your Agent Token, and the directories you want to share.*
3. **Start the Agent**:
   ```bash
   pnpm --filter @easy-access/agent dev
   ```

The remote machine will now appear as **Online** in your Hub dashboard, and you can browse its files securely!

---

## Security

- **Path Traversal Protection**: The agent rigorously checks all incoming paths against the configured `allowedDirs`. Any attempts to access files outside these directories (e.g., via `../`) are actively blocked.
- **Single Administrator**: The dashboard is restricted to authenticated users only. Ensure you change the default password in production.
