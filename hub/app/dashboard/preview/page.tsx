'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatBytes } from '@easy-access/shared';

interface FileData {
  content: string;
  mimeType: string;
  size: number;
}

interface ZipEntry {
  name: string;
  size: number;
  isDir: boolean;
  compressedSize?: number;
}

// ─── ZIP parsing ──────────────────────────────────────────────────────────────
async function parseZipEntries(base64: string): Promise<ZipEntry[]> {
  // Dynamically import fflate so it's only loaded when needed
  const { unzip } = await import('fflate');
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  return new Promise((resolve, reject) => {
    unzip(binary, (err, files) => {
      if (err) { reject(err); return; }
      const entries: ZipEntry[] = Object.entries(files).map(([name, data]) => ({
        name,
        size: data.length,
        isDir: name.endsWith('/'),
      }));
      // Sort: dirs first, then by name
      entries.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      resolve(entries);
    });
  });
}

export default function PreviewPage() {
  const searchParams = useSearchParams();
  const serverId = searchParams.get('serverId');
  const path = searchParams.get('path') ?? '';
  const fileName = path.split(/[/\\]/).pop() ?? 'Unknown';
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop()?.toLowerCase() : '';

  const [data, setData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Video
  const videoBlobUrl = useRef<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  // ZIP
  const [zipEntries, setZipEntries] = useState<ZipEntry[] | null>(null);
  const [zipError, setZipError] = useState('');
  const [zipSearch, setZipSearch] = useState('');

  const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'].includes(ext);
  const isText = ['.txt', '.md', '.log', '.csv', '.env', '.gitignore', '.editorconfig'].includes(ext);
  const isCode = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.yaml', '.yml', '.toml', '.xml', '.sh', '.bat', '.ps1', '.sql'].includes(ext);
  const isPdf = ext === '.pdf';
  const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'].includes(ext);
  const isAudio = ['.mp3', '.ogg', '.wav', '.flac', '.aac', '.m4a'].includes(ext);
  const isZip = ['.zip', '.jar'].includes(ext);

  useEffect(() => {
    if (!serverId || !path) return;
    setLoading(true);
    setError('');
    setVideoReady(false);
    setZipEntries(null);
    setZipError('');

    const params = new URLSearchParams({ serverId, path, action: 'read' });
    fetch(`/api/files?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setData(json.data);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));

    return () => {
      // Clean up any video blob URL on unmount / path change
      if (videoBlobUrl.current) {
        URL.revokeObjectURL(videoBlobUrl.current);
        videoBlobUrl.current = null;
      }
    };
  }, [serverId, path]);

  // Build video blob URL once data arrives
  useEffect(() => {
    if (!data || !isVideo) return;
    if (videoBlobUrl.current) {
      URL.revokeObjectURL(videoBlobUrl.current);
    }
    const bytes = Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: data.mimeType });
    videoBlobUrl.current = URL.createObjectURL(blob);
    setVideoReady(true);
  }, [data, isVideo]);

  // Parse ZIP once data arrives
  useEffect(() => {
    if (!data || !isZip) return;
    parseZipEntries(data.content)
      .then(setZipEntries)
      .catch((err) => setZipError((err as Error).message));
  }, [data, isZip]);

  const downloadFile = (fileData: FileData) => {
    const bytes = Uint8Array.from(atob(fileData.content), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: fileData.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (!data) return null;

    // ── Image ────────────────────────────────────────────────────────────────
    if (isImage) {
      const src = `data:${data.mimeType};base64,${data.content}`;
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)', background: 'var(--surface-bg)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
          <img src={src} alt={fileName} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
        </div>
      );
    }

    // ── Text / Code ──────────────────────────────────────────────────────────
    if (isText || isCode) {
      const text = atob(data.content);
      return (
        <pre style={{
          background: 'var(--surface-bg)',
          border: '1px solid var(--surface-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          overflow: 'auto',
          maxHeight: '70vh',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-relaxed)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          color: 'var(--text-primary)',
        }}>
          {text}
        </pre>
      );
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (isPdf) {
      const src = `data:application/pdf;base64,${data.content}`;
      return (
        <iframe src={src} style={{ width: '100%', height: '75vh', border: 'none', borderRadius: 'var(--radius-lg)' }} title={fileName} />
      );
    }

    // ── Video ────────────────────────────────────────────────────────────────
    if (isVideo) {
      if (!videoReady || !videoBlobUrl.current) {
        return <div className="skeleton" style={{ height: 400, borderRadius: 'var(--radius-xl)' }} />;
      }
      return (
        <div style={{
          background: '#000',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <video
            controls
            src={videoBlobUrl.current}
            style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block' }}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    // ── Audio ────────────────────────────────────────────────────────────────
    if (isAudio) {
      const bytes = Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mimeType });
      const src = URL.createObjectURL(blob);
      return (
        <div style={{
          background: 'var(--surface-bg)',
          border: '1px solid var(--surface-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-brand-400)' }}>
            <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <audio controls src={src} style={{ width: '100%', maxWidth: 480 }} />
        </div>
      );
    }

    // ── ZIP / JAR ────────────────────────────────────────────────────────────
    if (isZip) {
      if (zipError) {
        return (
          <div className="auth-error">{zipError}</div>
        );
      }
      if (!zipEntries) {
        return <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />;
      }

      const filtered = zipSearch
        ? zipEntries.filter((e) => e.name.toLowerCase().includes(zipSearch.toLowerCase()))
        : zipEntries;

      const fileCount = zipEntries.filter((e) => !e.isDir).length;
      const dirCount  = zipEntries.filter((e) => e.isDir).length;

      return (
        <div style={{
          background: 'var(--surface-bg)',
          border: '1px solid var(--surface-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          {/* ZIP header bar */}
          <div style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--surface-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-brand-400)', flexShrink: 0 }}>
                <path d="M14 3H6C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V8L14 3Z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M14 3V8H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10 12H14M10 16H14M10 8H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {fileCount} file{fileCount !== 1 ? 's' : ''}{dirCount > 0 ? `, ${dirCount} folder${dirCount !== 1 ? 's' : ''}` : ''}
              </span>
            </div>
            <input
              type="search"
              placeholder="Search contents…"
              value={zipSearch}
              onChange={(e) => setZipSearch(e.target.value)}
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--surface-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2) var(--space-3)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                width: 220,
                outline: 'none',
              }}
            />
          </div>

          {/* Entry list */}
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                No matching files
              </div>
            ) : (
              filtered.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-2) var(--space-5)',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--surface-border)' : 'none',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  {/* Icon */}
                  {entry.isDir ? (
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--color-brand-400)', flexShrink: 0 }}>
                      <path d="M2 5C2 4.44772 2.44772 4 3 4H7.58579C7.851 4 8.10536 4.10536 8.29289 4.29289L9.70711 5.70711C9.89464 5.89464 10.149 6 10.4142 6H17C17.5523 6 18 6.44772 18 7V15C18 15.5523 17.5523 16 17 16H3C2.44772 16 2 15.5523 2 15V5Z" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      <path d="M4 3H11L16 8V17C16 17.5523 15.5523 18 15 18H4C3.44772 18 3 17.5523 3 17V4C3 3.44772 3.44772 3 4 3Z" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M11 3V8H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                  {/* Name */}
                  <span style={{
                    flex: 1,
                    color: entry.isDir ? 'var(--text-secondary)' : 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {entry.name}
                  </span>
                  {/* Size */}
                  {!entry.isDir && (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {formatBytes(entry.size)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    // ── Unsupported — offer download ─────────────────────────────────────────
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M14 3H6C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V8L14 3Z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="empty-state-title">Preview not available</div>
        <div className="empty-state-text">This file type ({ext || 'unknown'}) cannot be previewed. You can download it instead.</div>
        <button className="btn btn-primary" onClick={() => downloadFile(data)}>
          Download File
        </button>
      </div>
    );
  };

  const parentPath = path.split(/[/\\]/).slice(0, -1).join(path.includes('\\') ? '\\' : '/');

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <Link
            href={`/dashboard/files?serverId=${serverId}&path=${encodeURIComponent(parentPath)}`}
            style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-1)', display: 'block' }}
          >
            ← Back to files
          </Link>
          <h1 className="page-title" style={{ fontSize: 'var(--text-xl)' }}>{fileName}</h1>
          {data && (
            <p className="page-subtitle">
              {data.mimeType} · {formatBytes(data.size)}
            </p>
          )}
        </div>
        <div className="page-header-right">
          {data && (
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(data)}>
              Download
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 400, borderRadius: 'var(--radius-xl)' }} />
      ) : error ? (
        <div className="auth-error">{error}</div>
      ) : (
        renderContent()
      )}
    </>
  );
}
