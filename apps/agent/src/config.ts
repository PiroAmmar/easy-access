// apps/agent/src/config.ts
// Agent configuration — loads from ~/.easy-access-agent/config.json.
// The config file is created by: easy-access-agent setup

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AgentConfig {
  hubUrl: string;        // e.g. "wss://my-server.example.com/ws"
  agentToken: string;    // Secret token — NEVER log this value
  allowedDirs: string[]; // Directories this agent is allowed to serve
}

export const CONFIG_PATH = path.join(
  os.homedir(),
  '.easy-access-agent',
  'config.json'
);

export function loadConfig(): AgentConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Agent not configured.\n` +
      `Config file not found: ${CONFIG_PATH}\n` +
      `Run: npx ts-node src/index.ts setup`
    );
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');

  let config: AgentConfig;
  try {
    config = JSON.parse(raw) as AgentConfig;
  } catch {
    throw new Error(`Invalid config file at ${CONFIG_PATH} — must be valid JSON`);
  }

  // Validate required fields
  if (!config.hubUrl || typeof config.hubUrl !== 'string') {
    throw new Error('Config missing required field: hubUrl');
  }
  if (!config.agentToken || typeof config.agentToken !== 'string') {
    throw new Error('Config missing required field: agentToken');
  }
  if (!Array.isArray(config.allowedDirs) || config.allowedDirs.length === 0) {
    throw new Error('Config missing required field: allowedDirs (must be non-empty array)');
  }

  return config;
}

export function saveConfig(config: AgentConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  // Write with restrictive permissions — owner-only read/write (unix: 0o600)
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  console.log(`[Config] Saved to ${CONFIG_PATH}`);
}
