// agent/src/index.ts
// Easy Access Agent — entry point.
//
// Usage:
//   npm start          — start the agent + local setup UI (http://localhost:4400)
//   npm run setup      — interactive CLI setup (alternative to the web UI)

import * as readline from 'readline';
import { saveConfig, configExists, CONFIG_PATH } from './config';
import { manager } from './manager';
import { startUiServer } from './ui-server';
import { log } from './logger';

async function setupCli(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log('\n=== Easy Access Agent Setup ===\n');
  console.log('Tip: you can also do this in your browser — run `npm start` and open http://localhost:4400\n');
  console.log('This will save your agent config to:', CONFIG_PATH, '\n');

  const hubUrl = await question('Hub WebSocket URL (e.g. wss://your-hub.up.railway.app/ws): ');
  const agentToken = await question('Agent Token (from the hub dashboard): ');
  const allowedDirsInput = await question('Shared folders (comma-separated, e.g. C:\\Users\\Data,D:\\Shared): ');

  rl.close();

  saveConfig({
    hubUrl: hubUrl.trim(),
    agentToken: agentToken.trim(),
    allowedDirs: allowedDirsInput.split(',').map((d) => d.trim()).filter(Boolean),
  });

  console.log('\n✓ Config saved. Run `npm start` to start the agent.\n');
}

async function main(): Promise<void> {
  if (process.argv[2] === 'setup') {
    await setupCli();
    return;
  }

  process.on('SIGINT', () => {
    console.log('\n[Agent] Shutting down...');
    manager.stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    manager.stop();
    process.exit(0);
  });
  process.on('unhandledRejection', (reason) => {
    log.error(`Unhandled promise rejection: ${reason}`);
    // Don't crash — the agent must stay running
  });

  log.info('Starting Easy Access Agent v1.0.0');
  startUiServer();

  if (configExists()) {
    const started = manager.startFromSavedConfig();
    if (!started) {
      log.warn('Could not start from saved config — fix it at http://localhost:4400');
    }
  } else {
    log.info('No config found yet — open http://localhost:4400 to set up this agent.');
  }
}

main().catch((err) => {
  console.error('[Agent] Fatal error:', err.message);
  process.exit(1);
});
