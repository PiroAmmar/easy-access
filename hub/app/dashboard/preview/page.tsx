'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatBytes } from '@easy-access/shared';

interface FileData {
  content: string;
  mimeType: string;
  size: number;
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

  useEffect(() => {
    if (!serverId || !path) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ serverId, path, action: 'read' });
    fetch(`/api/files?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setData(json.data);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [serverId, path]);

  const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'].includes(ext);
  const isText = ['.txt', '.md', '.log', '.csv', '.env', '.gitignore', '.editorconfig'].includes(ext);
  const isCode = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.yaml', '.yml', '.toml', '.xml', '.sh', '.bat', '.ps1', '.sql'].includes(ext);
  const isPdf = ext === '.pdf';

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

    if (isImage) {
      const src = `data:${data.mimeType};base64,${data.content}`;
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)', background: 'var(--surface-bg)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
          <img src={src} alt={fileName} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
        </div>
      );
    }

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

    if (isPdf) {
      const src = `data:application/pdf;base64,${data.content}`;
      return (
        <iframe src={src} style={{ width: '100%', height: '75vh', border: 'none', borderRadius: 'var(--radius-lg)' }} title={fileName} />
      );
    }

    // Unsupported — offer download
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
