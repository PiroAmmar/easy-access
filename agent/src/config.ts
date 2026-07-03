// agent/src/config.ts
// Agent configuration — stored at ~/.easy-access-agent/config.json.
// Managed through the local web UI (http://localhost:4400) or `npm run setup`.

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AgentConfig {
  hubUrl: string;        // e.g. "wss://my-hub.up.railway.app/ws"
  agentToken: string;    // Secret token — NEVER log this value
  allowedDirs: string[]; // Directories this agent is allowed to serve
}

export const CONFIG_PATH = path.join(
  os.homedir(),
  '.easy-access-agent',
  'config.json'
);

export function configExists(): boolean {
  return fs.existsSync(CONFIG_PATH);
}

export function loadConfig(): AgentConfig {
  if (!configExists()) {
    throw new Error(
      `Agent not configured. Open http://localhost:4400 to set it up, ` +
      `or run: npm run setup`
    );
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');

  let config: AgentConfig;
  try {
    config = JSON.parse(raw) as AgentConfig;
  } catch {
    throw new Error(`Invalid config file at ${CONFIG_PATH} — must be valid JSON`);
  }

  validateConfig(config);
  return config;
}

export function validateConfig(config: Partial<AgentConfig>): asserts config is AgentConfig {
  if (!config.hubUrl || typeof config.hubUrl !== 'string') {
    throw new Error('Missing required field: hubUrl');
  }
  if (!/^wss?:\/\//i.test(config.hubUrl.trim())) {
    throw new Error('Hub URL must start with ws:// or wss:// (e.g. wss://my-hub.up.railway.app/ws)');
  }
  if (!config.agentToken || typeof config.agentToken !== 'string') {
    throw new Error('Missing required field: agentToken');
  }
  if (!Array.isArray(config.allowedDirs) || config.allowedDirs.length === 0) {
    throw new Error('At least one allowed directory is required');
  }
  const missing = config.allowedDirs.filter((d) => !fs.existsSync(d));
  if (missing.length > 0) {
    throw new Error(`These directories do not exist on this machine: ${missing.join(', ')}`);
  }
}

export function saveConfig(config: AgentConfig): void {
  validateConfig(config);
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  // Write with restrictive permissions — owner-only read/write (unix: 0o600)
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  console.log(`[Config] Saved to ${CONFIG_PATH}`);
}
