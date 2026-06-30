import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Determine sensible safe roots based on the operating system.
// On Windows: allow all drive roots (C:\, D:\, etc.) and home dir.
// On Unix: allow /home, /Users, and /mnt (common mount points).
function getSafeRoots(): string[] {
  if (process.platform === 'win32') {
    // Include the home dir drive + all other common drive letters
    const homeDir = os.homedir();
    const homeDrive = path.parse(homeDir).root; // e.g. "C:\"
    const commonDrives = ['C:\\', 'D:\\', 'E:\\', 'F:\\', 'G:\\'];
    return [...new Set([homeDrive, ...commonDrives])];
  }
  return [os.homedir(), '/home', '/Users', '/mnt', '/media', '/opt'];
}

// Default starting path: OS home directory (C:\Users\Name or /home/name)
const DEFAULT_PATH = os.homedir();

function isPathAllowed(fullPath: string, safeRoots: string[]): boolean {
  return safeRoots.some(root => {
    const resolvedRoot = path.resolve(root);
    return fullPath === resolvedRoot || fullPath.startsWith(resolvedRoot + path.sep);
  });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get('path');

  // Default to OS home directory if no path provided
  const targetPath = typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : DEFAULT_PATH;

  try {
    const fullPath = path.resolve(targetPath);
    const safeRoots = getSafeRoots();

    // Path traversal guard: must be within one of the allowed roots
    if (!isPathAllowed(fullPath, safeRoots)) {
      return NextResponse.json(
        { error: 'Access denied: path is outside the allowed browse roots' },
        { status: 403 }
      );
    }

    // Check if path exists and is a directory
    const stats = await fs.promises.stat(fullPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      // Path may not exist (e.g. D:\ doesn't exist on this machine) — return empty
      return NextResponse.json({
        currentPath: fullPath,
        parentPath: null,
        directories: [],
      });
    }

    const items = await fs.promises.readdir(fullPath, { withFileTypes: true }).catch(() => []);

    // Filter only directories, sort alphabetically
    // On Windows: don't filter hidden entries (System Volume Information etc.) — just skip ones we can't access
    const directories = items
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => ({
        name: item.name,
        path: path.join(fullPath, item.name),
      }));

    // Calculate parent path — stop navigating up once we hit a safe root
    const parentPath = path.dirname(fullPath);
    const isAtRoot = fullPath === parentPath || safeRoots.some(r => path.resolve(r) === fullPath);

    return NextResponse.json({
      currentPath: fullPath,
      parentPath: isAtRoot ? null : parentPath,
      directories,
    });
  } catch (error) {
    console.error('[API] local-fs error:', error);
    return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
  }
}
