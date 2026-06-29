// apps/agent/src/system-info.ts
// Gathers system information (OS, CPU, RAM, disk) for reporting to the hub.
// Uses Node.js built-in `os` module. For detailed disk info, falls back to basic reporting.

import os from 'os';
import fs from 'fs';
import path from 'path';

interface DiskInfo {
  mount: string;
  totalGb: number;
  usedGb: number;
  freeGb: number;
}

interface SystemInfo {
  os: string;
  hostname: string;
  cpuUsagePercent: number;
  totalRamMb: number;
  usedRamMb: number;
  disks: DiskInfo[];
}

/**
 * Get OS display name (e.g., "Windows 11", "Linux").
 */
function getOsName(): string {
  const platform = os.platform();
  const release = os.release();

  switch (platform) {
    case 'win32': {
      // Windows release mapping (rough)
      const major = parseInt(release.split('.')[0], 10);
      if (major >= 10) return `Windows ${release.startsWith('10.0.22') ? '11' : '10'}`;
      return `Windows ${release}`;
    }
    case 'darwin':
      return `macOS ${release}`;
    case 'linux':
      return `Linux ${release}`;
    default:
      return `${platform} ${release}`;
  }
}

/**
 * Measure CPU usage over a short interval.
 */
async function getCpuUsage(): Promise<number> {
  const start = os.cpus().map((cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return { idle: cpu.times.idle, total };
  });

  await new Promise((r) => setTimeout(r, 200));

  const end = os.cpus().map((cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return { idle: cpu.times.idle, total };
  });

  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < start.length; i++) {
    idleDelta += end[i].idle - start[i].idle;
    totalDelta += end[i].total - start[i].total;
  }

  if (totalDelta === 0) return 0;
  return Math.round((1 - idleDelta / totalDelta) * 100);
}

/**
 * Get disk info for allowed directories.
 * On Windows, uses the drive letter; on Unix, reads from statfs.
 */
function getDiskInfo(allowedDirs: string[]): DiskInfo[] {
  const seen = new Set<string>();
  const disks: DiskInfo[] = [];

  for (const dir of allowedDirs) {
    const mount = process.platform === 'win32'
      ? path.parse(path.resolve(dir)).root // e.g., "C:\\"
      : '/';

    if (seen.has(mount)) continue;
    seen.add(mount);

    try {
      // fs.statfsSync is available in Node 18.15+
      type FsWithStatfs = typeof fs & { statfsSync?: (path: string) => { blocks: number; bsize: number; bavail: number } };
      const fsTyped = fs as FsWithStatfs;
      if (typeof fsTyped.statfsSync === 'function') {
        const stats = fsTyped.statfsSync(mount);
        const totalGb = (stats.blocks * stats.bsize) / (1024 ** 3);
        const freeGb = (stats.bavail * stats.bsize) / (1024 ** 3);
        disks.push({
          mount,
          totalGb: Math.round(totalGb * 10) / 10,
          usedGb: Math.round((totalGb - freeGb) * 10) / 10,
          freeGb: Math.round(freeGb * 10) / 10,
        });
      }
    } catch {
      // Cannot read disk info for this mount
    }
  }

  return disks;
}

/**
 * Gather full system information for reporting to the hub.
 */
export async function getSystemInfo(allowedDirs: string[]): Promise<SystemInfo> {
  const cpuUsagePercent = await getCpuUsage();

  const totalRamMb = Math.round(os.totalmem() / (1024 * 1024));
  const freeRamMb = Math.round(os.freemem() / (1024 * 1024));

  return {
    os: getOsName(),
    hostname: os.hostname(),
    cpuUsagePercent,
    totalRamMb,
    usedRamMb: totalRamMb - freeRamMb,
    disks: getDiskInfo(allowedDirs),
  };
}
