// agent/src/manager.ts
// Owns the lifecycle of the hub connection: starts it from saved config,
// restarts it when the config changes via the web UI.

import { AgentConnection, type ConnectionStatus } from './connection';
import { configExists, loadConfig, saveConfig, type AgentConfig } from './config';
import { log } from './logger';

class AgentManager {
  private connection: AgentConnection | null = null;
  private config: AgentConfig | null = null;

  /** Start from saved config if one exists. Returns true if started. */
  startFromSavedConfig(): boolean {
    if (!configExists()) return false;
    try {
      this.config = loadConfig();
    } catch (err) {
      log.error(`Saved config is invalid: ${(err as Error).message}`);
      return false;
    }
    this.startConnection();
    return true;
  }

  /** Save a new config and (re)connect with it. */
  applyConfig(config: AgentConfig): void {
    saveConfig(config); // validates + persists
    this.config = config;
    this.startConnection();
  }

  reconnect(): void {
    if (!this.config) throw new Error('Agent is not configured yet');
    this.startConnection();
  }

  disconnect(): void {
    this.connection?.stop();
    log.info('Disconnected by user');
  }

  getConfig(): AgentConfig | null {
    return this.config;
  }

  getStatus(): ConnectionStatus {
    return (
      this.connection?.getStatus() ?? {
        state: 'disconnected',
        serverName: null,
        serverId: null,
        connectedSince: null,
        lastError: null,
      }
    );
  }

  stop(): void {
    this.connection?.stop();
  }

  private startConnection(): void {
    this.connection?.stop();
    this.connection = new AgentConnection(this.config!);
    this.connection.start();
  }
}

export const manager = new AgentManager();
