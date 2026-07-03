// agent/src/logger.ts
// In-memory ring buffer of recent log lines, surfaced in the local web UI.
// Also mirrors everything to the console.

export interface LogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const MAX_ENTRIES = 200;
const entries: LogEntry[] = [];

function push(level: LogEntry['level'], message: string): void {
  entries.push({ ts: Date.now(), level, message });
  if (entries.length > MAX_ENTRIES) entries.shift();

  const line = `[Agent] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string) => push('info', message),
  warn: (message: string) => push('warn', message),
  error: (message: string) => push('error', message),
};

export function getRecentLogs(limit = 100): LogEntry[] {
  return entries.slice(-limit);
}
