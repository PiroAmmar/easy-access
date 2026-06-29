import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import os from 'os';

// The browser can only browse directories on the machine running the Hub.
// We restrict browsing to within the OS home directory to prevent
// accidentally exposing sensitive system directories.
const SAFE_ROOT = os.homedir();

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get('path');

  // Default to home directory if no path provided
  const targetPath = typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : SAFE_ROOT;

  try {
    const fullPath = path.resolve(targetPath);

    // Path traversal guard: resolved path must be within SAFE_ROOT
    const safeRoot = path.resolve(SAFE_ROOT);
    if (fullPath !== safeRoot && !fullPath.startsWith(safeRoot + path.sep)) {
      return NextResponse.json(
        { error: 'Access denied: path is outside the allowed browse root' },
        { status: 403 }
      );
    }

    // Check if path exists and is a directory
    const stats = await fs.promises.stat(fullPath).catch(() => null);

    if (!stats || !stats.isDirectory()) {
      return NextResponse.json({ error: 'Path not found or is not a directory' }, { status: 404 });
    }

    const items = await fs.promises.readdir(fullPath, { withFileTypes: true }).catch(() => []);

    // Filter only directories, sort alphabetically, skip hidden entries (starting with .)
    const directories = items
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => ({
        name: item.name,
        path: path.join(fullPath, item.name),
      }));

    const parentPath = path.dirname(fullPath);
    const isAtRoot = fullPath === parentPath || fullPath === safeRoot;

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
