// apps/agent/src/security.ts
// Path validation and security enforcement for ALL file operations.
// This is the MANDATORY security layer — validatePath() must be called
// before EVERY filesystem operation. No exceptions.

import path from 'path';
import fs from 'fs';

export class SecurityError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Validates that a requested path is within one of the configured allowed directories.
 *
 * Steps:
 * 1. Resolve the path to an absolute path (handles relative segments, .., etc.)
 * 2. Normalize separators (cross-platform)
 * 3. For existing paths, resolve symlinks to their real location
 * 4. Check that the resolved path starts with at least one allowedDir
 *
 * @returns The safe, resolved absolute path if valid
 * @throws SecurityError if the path is outside all allowed directories
 */
export function validatePath(requestedPath: string, allowedDirs: string[]): string {
  if (!requestedPath || typeof requestedPath !== 'string') {
    throw new SecurityError('PATH_INVALID', 'Path must be a non-empty string');
  }

  if (allowedDirs.length === 0) {
    throw new SecurityError(
      'NO_ALLOWED_DIRS',
      'No allowed directories configured for this server'
    );
  }

  // Step 1: Resolve to absolute (handles .., ./, relative paths)
  const resolved = path.resolve(requestedPath);

  // Step 2: Normalize to catch mixed separators on Windows (/ vs \)
  const normalized = path.normalize(resolved);

  // Step 3: For existing paths, resolve symlinks
  let realPath = normalized;
  try {
    realPath = fs.realpathSync(normalized);
  } catch {
    // Path doesn't exist yet (e.g., for write-file / mkdir) — use normalized path
    realPath = normalized;
  }

  // Step 4: Check against each allowed directory
  const isAllowed = allowedDirs.some((dir) => {
    const resolvedDir = path.resolve(dir);
    const normalizedDir = path.normalize(resolvedDir);
    // Ensure path starts with dir AND is either equal OR starts with dir + separator
    // Prevents "C:\data2" from matching "C:\data"
    return (
      realPath === normalizedDir ||
      realPath.startsWith(normalizedDir + path.sep)
    );
  });

  if (!isAllowed) {
    throw new SecurityError(
      'PATH_DENIED',
      `Access denied: "${realPath}" is outside allowed directories`
    );
  }

  return realPath;
}
