# Easy Access — Step-by-Step Setup Guide

This guide takes you from nothing to browsing your computer's files from anywhere.
No prior Railway experience needed — every step is explained.

There are three parts:

1. **Deploy the Hub to Railway** (~10 minutes) — the website you'll log into
2. **Connect your first computer** (~5 minutes) — install the agent on your PC
3. **View your files** — use the dashboard

---

## Part 1 — Deploy the Hub to Railway

Railway is a hosting service that runs your app in the cloud and gives it a
public web address. The Hub needs two things there: a **PostgreSQL database**
(where it stores your login and server list) and the **app itself**.

### Step 1.1 — Push this project to GitHub

Railway deploys code from GitHub, so the project must live in a GitHub repository.

1. Go to https://github.com/new and create a repository (private is fine), e.g. `easy-access`.
2. In a terminal, from this project folder (`easy-access/`), run:

   ```bash
   git init
   git add .
   git commit -m "Easy Access"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/easy-access.git
   git push -u origin main
   ```

   > Don't worry — secrets are never committed. `.env.local` files are ignored by git.

### Step 1.2 — Create a Railway project with a database

1. Go to https://railway.app and sign up / log in (you can use your GitHub account).
2. Click **New Project** → **Deploy PostgreSQL**.
   This creates a project containing an empty database. That's the Hub's storage.

### Step 1.3 — Add the Hub app to the project

1. Inside the same project, click **+ Create** → **GitHub Repo** and pick your `easy-access` repository.
   (The first time, Railway will ask permission to access your GitHub — allow it.)
2. Railway starts building immediately — it will **fail the first time**. That's expected:
   it doesn't know the app lives in the `hub/` folder yet, and it has no settings. Fix that now:
3. Click the new service → **Settings** tab → find **Root Directory** → set it to:

   ```
   hub
   ```

   *Why: the repository contains both `hub/` (the website) and `agent/` (the PC program).
   Railway should only build and run the `hub/` folder.*

### Step 1.4 — Set the environment variables (the app's secrets)

Click the Hub service → **Variables** tab → add these five variables:

| Variable | Value | What it is |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Connects the app to the database you created. Type it exactly like this — Railway replaces it with the real address automatically. |
| `AUTH_SECRET` | a long random string (see below) | Secret key used to sign your login session. Anyone with this could forge logins, so make it random. |
| `AUTH_TRUST_HOST` | `true` | Tells the login system it's OK to run behind Railway's proxy. |
| `ADMIN_USERNAME` | e.g. `admin` | The username you'll log in with. |
| `ADMIN_PASSWORD` | a strong password | The password you'll log in with. The account is created automatically on first start. |

To generate a good `AUTH_SECRET`, run this in a terminal and copy the output:

```bash
openssl rand -base64 32
```

(Or on Windows PowerShell: `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))`)

> **Note:** if the Postgres service in your project has a different name than
> `Postgres`, use that name inside `${{...}}`. You can also click the
> "Add Reference" suggestion Railway shows when creating the variable.

### Step 1.5 — Give the Hub a public web address

1. Hub service → **Settings** → **Networking** → click **Generate Domain**.
2. When asked for a port, use **3000** (Railway usually detects it automatically).
3. You'll get an address like:

   ```
   https://easy-access-production-a1b2.up.railway.app
   ```

   Write it down — this is your dashboard address, and you'll need it for the agent too.

### Step 1.6 — Deploy and log in

1. Go to the **Deployments** tab and click **Redeploy** (so the new settings apply).
2. Wait for the build to finish (a few minutes). The logs should end with:

   ```
   [Migrate] Database is up to date
   [Admin] Created admin account "admin"
   > Ready on http://0.0.0.0:3000
   ```

   *The app sets up its own database tables and admin account on every start — there's nothing to run manually.*
3. Open your Railway domain in a browser. You'll see the login page.
4. Log in with the `ADMIN_USERNAME` and `ADMIN_PASSWORD` you set.

🎉 The Hub is live. Now let's connect a computer to it.

---

## Part 2 — Connect your first computer

The **agent** is a small program that runs on the computer whose files you want
to access. It connects *out* to your Hub (like a browser does), so you don't
need to change any router or firewall settings.

### Step 2.1 — Register the computer in the dashboard

1. In your Hub dashboard, click **Servers** in the sidebar.
2. Click **Add Server**.
3. Give it a name you'll recognize, like `My Laptop`.
4. Enter the folder(s) you want to share, e.g. `C:\Users\you\Documents`.
5. Click create. The dashboard shows an **Agent Token** — a long random string.
   **Copy it now.** This token is the computer's password to your Hub.

### Step 2.2 — Install and start the agent on your computer

You need [Node.js](https://nodejs.org) version 20 or newer installed.

In a terminal, from this project folder:

```bash
cd agent
npm install
npm start
```

You'll see:

```
[Agent] Setup UI available at http://localhost:4400
[Agent] No config found yet — open http://localhost:4400 to set up this agent.
```

### Step 2.3 — Configure it in your browser (no config files!)

1. Open **http://localhost:4400** — this page only exists on your own computer;
   nobody else can reach it.
2. Fill in the three fields:
   - **Hub WebSocket URL** — your Railway domain, but starting with `wss://`
     and ending with `/ws`. Example:

     ```
     wss://easy-access-production-a1b2.up.railway.app/ws
     ```

     *(wss = "WebSocket Secure" — the always-open connection the agent keeps to your Hub.)*
   - **Agent Token** — paste the token you copied in Step 2.1.
   - **Shared Folders** — the folders to share, one per line. Example:

     ```
     C:\Users\you\Documents
     D:\Photos
     ```

     Only these folders (and what's inside them) will ever be accessible.
3. Click **Save & Connect**.

Within a couple of seconds the status dot turns **green — Connected**, and the
activity log shows `Authenticated as: My Laptop`. If something is wrong (bad
token, typo in the URL), the exact error appears right there on the page.

> The agent keeps running as long as the terminal window is open. Closing it
> disconnects the computer; running `npm start` again reconnects it
> automatically with the saved settings.

---

## Part 3 — View your files

1. Open your Hub dashboard (the Railway address) from any device — phone, work
   laptop, anywhere.
2. Log in, then click **Servers**. Your computer shows as **Online** with a
   green dot.
3. Click the server, then browse into your shared folders:
   - **Click folders** to navigate into them
   - **Click a file** to preview or download it
   - **Upload** puts files onto the remote computer
   - **Delete / rename / new folder** work like a normal file manager
4. The **Activity** page keeps a log of everything that was accessed.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Railway build fails immediately | Check **Root Directory** is set to `hub` (Step 1.3). |
| Deploy logs show a database error | Check `DATABASE_URL` is exactly `${{Postgres.DATABASE_URL}}` and the Postgres service exists in the same project. |
| Can't log in | The admin account comes from `ADMIN_USERNAME` / `ADMIN_PASSWORD` variables. Change them and redeploy — the password updates automatically on start. |
| Agent stuck on "Connecting…" | The Hub URL must start with `wss://` and end with `/ws`. Check for typos; check the Hub is deployed and reachable in a browser. |
| Agent says "Authentication failed" | The token doesn't match. Create a new server in the dashboard (or copy the token again) and paste it into http://localhost:4400. |
| Server shows Offline in dashboard | The agent isn't running — start it with `npm start` in the `agent/` folder. |
| "Access denied: outside allowed directories" | You tried to open a folder the agent doesn't share. Add it in the agent UI (Shared Folders) and save. |

## Running the Hub on your own machine instead of Railway

For testing, you can run everything locally: follow the "Hub — local
development" section in [README.md](README.md), then point the agent at
`ws://localhost:3000/ws`.
