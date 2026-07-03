// agent/src/ui-server.ts
// Local web UI for configuring and monitoring the agent.
// Binds to 127.0.0.1 ONLY — never expose this to the network: it manages
// the agent token and shared directories.
//
//   GET  /             → setup + status page
//   GET  /api/status   → { configured, status, hubUrl, allowedDirs, logs }
//   POST /api/config   → save { hubUrl, agentToken, allowedDirs } and reconnect
//   POST /api/reconnect
//   POST /api/disconnect

import http from 'http';
import { manager } from './manager';
import { configExists, CONFIG_PATH } from './config';
import { getRecentLogs, log } from './logger';

const UI_PORT = parseInt(process.env.AGENT_UI_PORT || '4400', 10);
const UI_HOST = '127.0.0.1';

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function startUiServer(): void {
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';

    try {
      if (req.method === 'GET' && url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(PAGE_HTML);
        return;
      }

      if (req.method === 'GET' && url === '/api/status') {
        const config = manager.getConfig();
        json(res, 200, {
          configured: config !== null || configExists(),
          configPath: CONFIG_PATH,
          hubUrl: config?.hubUrl ?? null,
          allowedDirs: config?.allowedDirs ?? [],
          status: manager.getStatus(),
          logs: getRecentLogs(60),
        });
        return;
      }

      if (req.method === 'POST' && url === '/api/config') {
        const body = JSON.parse(await readBody(req)) as {
          hubUrl?: string;
          agentToken?: string;
          allowedDirs?: string[];
        };

        // Blank token in the form means "keep the saved one"
        const existing = manager.getConfig();
        const agentToken =
          body.agentToken && body.agentToken.trim()
            ? body.agentToken.trim()
            : existing?.agentToken ?? '';

        manager.applyConfig({
          hubUrl: (body.hubUrl ?? '').trim(),
          agentToken,
          allowedDirs: (body.allowedDirs ?? []).map((d) => d.trim()).filter(Boolean),
        });
        json(res, 200, { success: true });
        return;
      }

      if (req.method === 'POST' && url === '/api/reconnect') {
        manager.reconnect();
        json(res, 200, { success: true });
        return;
      }

      if (req.method === 'POST' && url === '/api/disconnect') {
        manager.disconnect();
        json(res, 200, { success: true });
        return;
      }

      json(res, 404, { success: false, error: 'Not found' });
    } catch (err) {
      json(res, 400, { success: false, error: (err as Error).message });
    }
  });

  server.listen(UI_PORT, UI_HOST, () => {
    log.info(`Setup UI available at http://localhost:${UI_PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      log.error(
        `Port ${UI_PORT} is already in use — is another agent running? ` +
          `Set AGENT_UI_PORT to use a different port.`
      );
      process.exit(1);
    }
    log.error(`UI server error: ${err.message}`);
  });
}

const PAGE_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Easy Access Agent</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --border: #2a2f3a;
    --text: #e6e9ef; --muted: #9aa3b2; --accent: #4f8cff;
    --ok: #34d399; --warn: #fbbf24; --err: #f87171;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 16px; background: var(--bg); color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; justify-content: center;
  }
  main { width: 100%; max-width: 640px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .card {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px; margin-bottom: 16px;
  }
  .row { display: flex; align-items: center; gap: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .dot.connected { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  .dot.connecting { background: var(--warn); }
  .dot.disconnected, .dot.auth-failed { background: var(--err); }
  #statusText { font-weight: 600; }
  #statusDetail { color: var(--muted); font-size: 13px; margin-top: 4px; }
  label { display: block; font-size: 13px; color: var(--muted); margin: 14px 0 4px; }
  input, textarea {
    width: 100%; background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 9px 11px; font: inherit;
  }
  textarea { min-height: 72px; resize: vertical; font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
  input:focus, textarea:focus { outline: none; border-color: var(--accent); }
  .hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .actions { display: flex; gap: 10px; margin-top: 18px; }
  button {
    font: inherit; font-weight: 600; border: none; border-radius: 6px;
    padding: 9px 16px; cursor: pointer; background: var(--accent); color: #fff;
  }
  button.secondary { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  button:disabled { opacity: .5; cursor: default; }
  #saveMsg { font-size: 13px; margin-top: 10px; min-height: 18px; }
  #saveMsg.ok { color: var(--ok); } #saveMsg.err { color: var(--err); }
  #logs {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 10px; height: 200px; overflow-y: auto;
    font-family: ui-monospace, Consolas, monospace; font-size: 12px; white-space: pre-wrap;
  }
  .log-warn { color: var(--warn); } .log-error { color: var(--err); }
  h2 { font-size: 14px; margin: 0 0 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
</style>
</head>
<body>
<main>
  <h1>Easy Access Agent</h1>
  <div class="sub">This machine's connection to your Easy Access hub</div>

  <div class="card">
    <div class="row">
      <div class="dot disconnected" id="dot"></div>
      <span id="statusText">Loading…</span>
    </div>
    <div id="statusDetail"></div>
  </div>

  <div class="card">
    <h2>Settings</h2>
    <form id="form">
      <label for="hubUrl">Hub WebSocket URL</label>
      <input id="hubUrl" placeholder="wss://your-hub.up.railway.app/ws" autocomplete="off" spellcheck="false">
      <div class="hint">Your Railway hub URL with <code>wss://</code> and <code>/ws</code> at the end. For local testing: <code>ws://localhost:3000/ws</code></div>

      <label for="token">Agent Token</label>
      <input id="token" type="password" autocomplete="off" spellcheck="false">
      <div class="hint" id="tokenHint">Copy it from the hub dashboard → Servers → Add Server.</div>

      <label for="dirs">Shared Folders (one per line)</label>
      <textarea id="dirs" placeholder="C:\\Users\\you\\Documents&#10;D:\\Shared" spellcheck="false"></textarea>
      <div class="hint">Only these folders (and everything inside them) will be accessible from the hub.</div>

      <div class="actions">
        <button type="submit" id="saveBtn">Save &amp; Connect</button>
        <button type="button" class="secondary" id="reconnectBtn">Reconnect</button>
        <button type="button" class="secondary" id="disconnectBtn">Disconnect</button>
      </div>
      <div id="saveMsg"></div>
    </form>
  </div>

  <div class="card">
    <h2>Activity Log</h2>
    <div id="logs"></div>
  </div>
</main>

<script>
  const $ = (id) => document.getElementById(id);
  let hasSavedToken = false;
  let formTouched = false;
  let firstLoad = true;

  ['hubUrl', 'token', 'dirs'].forEach((id) =>
    $(id).addEventListener('input', () => { formTouched = true; })
  );

  const STATE_LABELS = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Disconnected',
    'auth-failed': 'Authentication failed',
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function refresh() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      const s = data.status;

      $('dot').className = 'dot ' + s.state;
      $('statusText').textContent = STATE_LABELS[s.state] || s.state;

      let detail = '';
      if (s.state === 'connected' && s.serverName) {
        detail = 'Registered as "' + s.serverName + '"';
        if (s.connectedSince) detail += ' · since ' + new Date(s.connectedSince).toLocaleTimeString();
      } else if (!data.configured) {
        detail = 'Not configured yet — fill in the settings below to get started.';
      } else if (s.lastError) {
        detail = s.lastError;
      }
      $('statusDetail').textContent = detail;

      // Populate the form once (don't clobber while the user is typing)
      if (firstLoad && !formTouched && data.configured) {
        $('hubUrl').value = data.hubUrl || '';
        $('dirs').value = (data.allowedDirs || []).join('\\n');
        hasSavedToken = true;
        $('token').placeholder = '(saved — leave blank to keep)';
        $('tokenHint').textContent = 'A token is already saved. Enter a new one only if you want to replace it.';
        firstLoad = false;
      }
      if (data.configured) firstLoad = false;

      const logs = (data.logs || []).map((l) => {
        const t = new Date(l.ts).toLocaleTimeString();
        const cls = l.level === 'error' ? 'log-error' : l.level === 'warn' ? 'log-warn' : '';
        return '<div class="' + cls + '">' + t + '  ' + esc(l.message) + '</div>';
      }).join('');
      const el = $('logs');
      const stickToBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      el.innerHTML = logs;
      if (stickToBottom) el.scrollTop = el.scrollHeight;
    } catch {
      $('dot').className = 'dot disconnected';
      $('statusText').textContent = 'Agent process not reachable';
      $('statusDetail').textContent = '';
    }
  }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('saveMsg');
    msg.className = ''; msg.textContent = 'Saving…';
    $('saveBtn').disabled = true;
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hubUrl: $('hubUrl').value,
          agentToken: $('token').value,
          allowedDirs: $('dirs').value.split('\\n'),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Save failed');
      msg.className = 'ok'; msg.textContent = 'Saved — connecting…';
      $('token').value = '';
      hasSavedToken = true;
      $('token').placeholder = '(saved — leave blank to keep)';
      formTouched = false;
    } catch (err) {
      msg.className = 'err'; msg.textContent = err.message;
    } finally {
      $('saveBtn').disabled = false;
      refresh();
    }
  });

  $('reconnectBtn').addEventListener('click', async () => {
    await fetch('/api/reconnect', { method: 'POST' }); refresh();
  });
  $('disconnectBtn').addEventListener('click', async () => {
    await fetch('/api/disconnect', { method: 'POST' }); refresh();
  });

  refresh();
  setInterval(refresh, 2000);
</script>
</body>
</html>`;
