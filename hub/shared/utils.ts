// packages/shared/src/utils.ts
// Shared utility functions used by both hub and agent.

/**
 * Format bytes to human-readable string.
 * e.g. 1024 → "1.0 KB", 1048576 → "1.0 MB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format a Unix timestamp (ms) to a locale date string.
 */
function formatDate(timestampMs: number | Date): string {
  const date = timestampMs instanceof Date ? timestampMs : new Date(timestampMs);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get a MIME type from a file extension.
 * Used by the agent when returning file content.
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    // Documents
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc:  'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls:  'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt:  'application/mspowerpoint',
    // Text / Code
    txt:  'text/plain',
    md:   'text/markdown',
    csv:  'text/csv',
    json: 'application/json',
    xml:  'application/xml',
    html: 'text/html',
    htm:  'text/html',
    css:  'text/css',
    js:   'text/javascript',
    mjs:  'text/javascript',
    ts:   'text/typescript',
    tsx:  'text/typescript',
    jsx:  'text/javascript',
    yaml: 'text/yaml',
    yml:  'text/yaml',
    toml: 'text/plain',
    sql:  'text/plain',
    sh:   'text/x-shellscript',
    bat:  'text/x-bat',
    ps1:  'text/x-powershell',
    py:   'text/x-python',
    rs:   'text/x-rust',
    go:   'text/x-go',
    java: 'text/x-java',
    c:    'text/x-c',
    cpp:  'text/x-c++',
    h:    'text/x-c',
    // Images
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    svg:  'image/svg+xml',
    webp: 'image/webp',
    avif: 'image/avif',
    bmp:  'image/bmp',
    tiff: 'image/tiff',
    ico:  'image/x-icon',
    // Video
    mp4:  'video/mp4',
    webm: 'video/webm',
    mov:  'video/quicktime',
    avi:  'video/x-msvideo',
    mkv:  'video/x-matroska',
    // Audio
    mp3:  'audio/mpeg',
    ogg:  'audio/ogg',
    wav:  'audio/wav',
    flac: 'audio/flac',
    aac:  'audio/aac',
    // Archives
    zip:  'application/zip',
    tar:  'application/x-tar',
    gz:   'application/gzip',
    '7z': 'application/x-7z-compressed',
    rar:  'application/vnd.rar',
    // Binary / Misc
    wasm: 'application/wasm',
    woff:  'font/woff',
    woff2: 'font/woff2',
    ttf:   'font/ttf',
    eot:   'application/vnd.ms-fontobject',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

/**
 * Sanitize a filename — strip path separators and dangerous characters.
 * Use this on display names, not for path validation (use validatePath for that).
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')  // Replace path/shell special chars
    .replace(/\.\./g, '_')            // No double-dots
    .trim();
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Clamp a number between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
