// apps/agent/src/index.ts
// Easy Access Agent — entry point.
// Loads config and starts the WebSocket connection to the hub.
//
// Usage:
//   ts-node src/index.ts          — start agent (requires config)
//   ts-node src/index.ts setup    — interactive setup wizard

import { loadConfig, saveConfig, CONFIG_PATH } from './config';
import { AgentConnection } from './connection';
import * as readline from 'readline';

async function setup(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log('\n=== Easy Access Agent Setup ===\n');
  console.log('This will create your agent config at:', CONFIG_PATH);
  console.log('You can find your agent token in the Easy Access dashboard.\n');

  const hubUrl = await question('Hub WebSocket URL (e.g. wss://myserver.com/ws): ');
  const agentToken = await question('Agent Token (from dashboard): ');
  const allowedDirsInput = await question('Allowed Directories (comma-separated, e.g. C:\\Users\\Data,D:\\Shared): ');

  rl.close();

  const allowedDirs = allowedDirsInput
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0);

  if (!hubUrl.trim()) throw new Error('Hub URL is required');
  if (!agentToken.trim()) throw new Error('Agent token is required');
  if (allowedDirs.length === 0) throw new Error('At least one allowed directory is required');

  saveConfig({
    hubUrl: hubUrl.trim(),
    agentToken: agentToken.trim(),
    allowedDirs,
  });

  console.log('\n✓ Config saved successfully!');
  console.log('Run: ts-node src/index.ts  to start the agent\n');
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === 'setup') {
    await setup();
    return;
  }

  // Load config and start agent
  const config = loadConfig();
  const connection = new AgentConnection(config);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Agent] Shutting down...');
    connection.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Agent] Received SIGTERM, shutting down...');
    connection.stop();
    process.exit(0);
  });

  // Handle unhandled promise rejections gracefully
  process.on('unhandledRejection', (reason) => {
    console.error('[Agent] Unhandled promise rejection:', reason);
    // Don't crash — the agent must stay running
  });

  console.log('[Agent] Starting Easy Access Agent v0.1.0');
  console.log(`[Agent] Hub URL: ${config.hubUrl}`);
  console.log(`[Agent] Token: [REDACTED]`);  // NEVER log the actual token
  console.log(`[Agent] Allowed dirs: ${config.allowedDirs.join(', ')}`);
  console.log('[Agent] Press Ctrl+C to stop.\n');

  connection.start();
}

main().catch((err) => {
  console.error('[Agent] Fatal error:', err.message);
  process.exit(1);
});
