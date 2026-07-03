// agent/src/file-ops.ts
// Secure file system operations for the remote agent.
// ALL functions call validatePath() before any fs operation.
// This file is the ONLY place fs operations happen in the agent.

import fs from 'fs';
import path from 'path';
import { validatePath, SecurityError } from './security';
import type { FileEntry } from './shared';
import { getMimeType } from './shared';

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB hard limit

/**
 * List the contents of a directory.
 * Uses async I/O throughout to avoid blocking the event loop.
 * @throws SecurityError if the path is outside allowed directories
 */
export async function listDirectory(
  requestedPath: string,
  allowedDirs: string[]
): Promise<FileEntry[]> {
  const safePath = validatePath(requestedPath, allowedDirs);

  const stat = await fs.promises.stat(safePath);
  if (!stat.isDirectory()) {
    throw new Error('PATH_NOT_DIR: Path is not a directory');
  }

  const entries = await fs.promises.readdir(safePath, { withFileTypes: true });

  // Stat all entries concurrently — much faster than a serial loop
  const fileEntries = await Promise.all(
    entries.map(async (entry): Promise<FileEntry> => {
      const entryPath = path.join(safePath, entry.name);
      let size = 0;
      let modifiedAt = 0;

      try {
        const entryStat = await fs.promises.stat(entryPath);
        size = entryStat.isFile() ? entryStat.size : 0;
        modifiedAt = entryStat.mtimeMs;
      } catch {
        // Entry may have disappeared between readdir and stat (race condition)
      }

      return {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
        size,
        modifiedAt,
        extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : '',
      };
    })
  );

  return fileEntries;
}

/**
 * Read a file and return its content as base64.
 * Hard limit: 50 MB. Files larger than this return an error.
 * @throws SecurityError if the path is outside allowed directories
 * @throws Error if the file is too large
 */
export async function readFile(
  requestedPath: string,
  allowedDirs: string[]
): Promise<{ content: string; size: number; mimeType: string }> {
  const safePath = validatePath(requestedPath, allowedDirs);

  const stat = await fs.promises.stat(safePath);

  if (stat.isDirectory()) {
    throw new Error('PATH_IS_DIR: Cannot read a directory as a file');
  }

  if (stat.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `FILE_TOO_LARGE: File is ${stat.size} bytes, max is ${MAX_FILE_SIZE_BYTES}`
    );
  }

  const buffer = await fs.promises.readFile(safePath);

  return {
    content: buffer.toString('base64'),
    size: stat.size,
    mimeType: getMimeType(path.basename(safePath)),
  };
}

/**
 * Write a file from base64 content.
 * Creates parent directories if they don't exist.
 * @throws SecurityError if the path is outside allowed directories
 */
export async function writeFile(
  requestedPath: string,
  base64Content: string,
  allowedDirs: string[],
  overwrite: boolean
): Promise<void> {
  const safePath = validatePath(requestedPath, allowedDirs);

  if (!overwrite) {
    try {
      await fs.promises.access(safePath);
      // If access() doesn't throw, the file exists
      throw new Error('FILE_EXISTS: File already exists and overwrite is false');
    } catch (err) {
      // access() threw — file doesn't exist, we can proceed
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  // Check estimated decoded size before allocating
  const estimatedSize = Math.ceil(base64Content.length * 0.75);
  if (estimatedSize > MAX_FILE_SIZE_BYTES) {
    throw new Error(`FILE_TOO_LARGE: Content exceeds ${MAX_FILE_SIZE_BYTES} bytes`);
  }

  // Ensure the parent directory exists
  await fs.promises.mkdir(path.dirname(safePath), { recursive: true });

  const buffer = Buffer.from(base64Content, 'base64');
  await fs.promises.writeFile(safePath, buffer);
}

/**
 * Delete a file or empty directory.
 * Recursive delete is explicitly NOT supported — too dangerous.
 * @throws SecurityError if the path is outside allowed directories
 * @throws Error if attempting to delete a non-empty directory
 */
export async function deleteFile(
  requestedPath: string,
  allowedDirs: string[]
): Promise<void> {
  const safePath = validatePath(requestedPath, allowedDirs);

  const stat = await fs.promises.stat(safePath);

  if (stat.isDirectory()) {
    // Only allow deleting EMPTY directories — recursive delete is too dangerous
    const entries = await fs.promises.readdir(safePath);
    if (entries.length > 0) {
      throw new Error('DIR_NOT_EMPTY: Cannot delete a non-empty directory');
    }
    await fs.promises.rmdir(safePath);
  } else {
    await fs.promises.unlink(safePath);
  }
}

/**
 * Move or rename a file/directory.
 * BOTH source and destination must be within allowed directories.
 * @throws SecurityError if either path is outside allowed directories
 */
export async function moveFile(
  sourcePath: string,
  destinationPath: string,
  allowedDirs: string[]
): Promise<void> {
  // BOTH paths must be validated — prevents moving files OUT of allowed dirs
  const safeSrc = validatePath(sourcePath, allowedDirs);
  const safeDest = validatePath(destinationPath, allowedDirs);

  if (safeSrc === safeDest) {
    throw new Error('SAME_PATH: Source and destination are the same');
  }

  // Ensure destination parent exists
  await fs.promises.mkdir(path.dirname(safeDest), { recursive: true });

  await fs.promises.rename(safeSrc, safeDest);
}

/**
 * Create a directory (recursive).
 * @throws SecurityError if the path is outside allowed directories
 */
export async function makeDirectory(
  requestedPath: string,
  allowedDirs: string[]
): Promise<void> {
  const safePath = validatePath(requestedPath, allowedDirs);
  await fs.promises.mkdir(safePath, { recursive: true });
}

export { SecurityError };
