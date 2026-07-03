import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Determine if we are running inside a cloud container (e.g. Railway, Render, Docker).
// In that case, "Browse Local" is meaningless because the Hub filesystem is not
// the user's machine — we warn the user instead of showing an empty /root dir.
function isCloudContainer(): boolean {
  return (
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RENDER ||
    (process.platform === 'linux' && os.homedir() === '/root' && !process.env.ALLOW_ROOT_BROWSE)
  );
}

function getSafeRoots(): string[] {
  if (process.platform === 'win32') {
    // Windows: allow common drive roots + home dir
    const homeDrive = path.parse(os.homedir()).root; // e.g. "C:\"
    return [...new Set([homeDrive, 'C:\\', 'D:\\', 'E:\\', 'F:\\'])];
  }
  // Unix/macOS: start from home; also allow /home, /Users, /mnt, /media
  return [os.homedir(), '/home', '/Users', '/mnt', '/media', '/opt'];
}

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

  // Warn the client that Browse Local won't work in a cloud deployment
  if (isCloudContainer()) {
    return NextResponse.json(
      {
        error: 'CLOUD_DEPLOY',
        message:
          'Browse Local is only available when the Hub runs on your own machine. ' +
          'Type the directory path manually instead (e.g. C:\\Users\\YourName\\Documents).',
      },
      { status: 422 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get('path');
  const targetPath = typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : DEFAULT_PATH;

  try {
    const fullPath = path.resolve(targetPath);
    const safeRoots = getSafeRoots();

    if (!isPathAllowed(fullPath, safeRoots)) {
      return NextResponse.json(
        { error: 'Access denied: path is outside the allowed browse roots' },
        { status: 403 }
      );
    }

    const stats = await fs.promises.stat(fullPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return NextResponse.json({
        currentPath: fullPath,
        parentPath: null,
        directories: [],
      });
    }

    const items = await fs.promises.readdir(fullPath, { withFileTypes: true }).catch(() => []);

    const directories = items
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => ({
        name: item.name,
        path: path.join(fullPath, item.name),
      }));

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
