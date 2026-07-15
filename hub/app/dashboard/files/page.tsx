'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFileStore } from '@/lib/stores/file-store';
import FileIcon from '@/components/file-browser/file-icon';
import { formatBytes } from '@easy-access/shared';
import '@/styles/file-browser.css';

export default function FileBrowserPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const serverId = searchParams.get('serverId');
  const pathParam = searchParams.get('path') ?? '/';

  const {
    entries, isLoading, error, currentPath, viewMode,
    navigateTo, setServer, goUp, setViewMode,
    selectedEntries, toggleSelect, clearSelection,
  } = useFileStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (serverId) setServer(serverId, pathParam);
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = useCallback((path: string, type: string) => {
    if (type === 'directory') {
      const params = new URLSearchParams({ serverId: serverId!, path });
      router.push(`/dashboard/files?${params}`);
      navigateTo(path);
    } else {
      // Open preview
      const params = new URLSearchParams({ serverId: serverId!, path });
      router.push(`/dashboard/preview?${params}`);
    }
  }, [serverId, router, navigateTo]);

  const handleGoUp = useCallback(() => {
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(sep).filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    const parent = currentPath.startsWith('/') ? '/' + parts.join(sep) : parts.join(sep) + (sep === '\\' ? '\\' : '/');
    const params = new URLSearchParams({ serverId: serverId!, path: parent });
    router.push(`/dashboard/files?${params}`);
    navigateTo(parent);
  }, [currentPath, serverId, router, navigateTo]);

  const MENU_W = 200;
  const MENU_H = 150;
  const clampMenuPos = (x: number, y: number) => ({
    x: Math.min(x, window.innerWidth - MENU_W - 8),
    y: Math.min(y, window.innerHeight - MENU_H - 8),
  });

  const handleContextMenu = (e: React.MouseEvent, path: string, type: string) => {
    e.preventDefault();
    const { x, y } = clampMenuPos(e.clientX, e.clientY);
    setContextMenu({ x, y, path, type });
  };

  const handleDownload = async (path: string) => {
    setContextMenu(null);
    const params = new URLSearchParams({ serverId: serverId!, path, action: 'read' });
    try {
      const res = await fetch(`/api/files?${params}`);
      const json = await res.json();
      if (!json.success) { alert(json.error); return; }
      const blob = new Blob([Uint8Array.from(atob(json.data.content), (c) => c.charCodeAt(0))], { type: json.data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split(/[/\\]/).pop() ?? 'file';
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Download failed'); }
  };

  const handleDelete = async (path: string) => {
    setContextMenu(null);
    if (!confirm(`Delete "${path.split(/[/\\]/).pop()}"?`)) return;
    try {
      const params = new URLSearchParams({ serverId: serverId!, path });
      const res = await fetch(`/api/files?${params}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) alert(json.error);
      else navigateTo(currentPath);
    } catch { alert('Delete failed'); }
  };

  const handleUpload = async (files: FileList) => {
    if (!serverId) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const sep = currentPath.includes('\\') ? '\\' : '/';
      const filePath = currentPath.endsWith(sep) ? currentPath + file.name : currentPath + sep + file.name;
      try {
        const res = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId, path: filePath, action: 'write', content: base64, overwrite: true }),
        });
        const json = await res.json();
        if (!json.success) alert(`Upload failed for ${file.name}: ${json.error}`);
      } catch { alert(`Upload failed for ${file.name}`); }
    }
    setUploading(false);
    navigateTo(currentPath);
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // Breadcrumbs
  const sep = currentPath.includes('\\') ? '\\' : '/';
  const pathParts = currentPath.split(sep).filter(Boolean);

  // Sort entries: directories first, then by name
  const sorted = [...entries].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  if (!serverId) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No server selected</div>
        <div className="empty-state-text">Select a server from the Servers page to browse its files.</div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Files</h1>
        </div>
        <div className="page-header-right">
          <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => e.target.files && handleUpload(e.target.files)} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <><span className="spinner" /> Uploading...</> : 'Upload'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigateTo(currentPath)}>Refresh</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="file-browser-toolbar">
        <div className="file-browser-toolbar-left">
          <button className="topbar-btn" onClick={handleGoUp} title="Go up" disabled={pathParts.length <= 1}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 12V4M8 4L4 8M8 4L12 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="breadcrumbs">
            {pathParts.map((part, i) => {
              const fullPath = (currentPath.startsWith('/') ? '/' : '') + pathParts.slice(0, i + 1).join(sep) + (sep === '\\' && i < pathParts.length - 1 ? '\\' : '');
              const isCurrent = i === pathParts.length - 1;
              return (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  {i > 0 && <span className="breadcrumb-sep">/</span>}
                  <button
                    className={`breadcrumb-item ${isCurrent ? 'current' : ''}`}
                    onClick={() => !isCurrent && handleNavigate(fullPath + (sep === '\\' ? '\\' : '/'), 'directory')}
                    disabled={isCurrent}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
        <div className="file-browser-toolbar-right">
          <div className="view-toggle">
            <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 3H13M1 7H13M1 11H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {isLoading ? (
        <div className={viewMode === 'grid' ? 'file-grid' : ''}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: viewMode === 'grid' ? 120 : 40, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div
          className="upload-zone"
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto var(--space-2)' }}>
            <path d="M12 16V8M12 8L8 12M12 8L16 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20 16V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>This directory is empty. Drop files here to upload.</div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="file-grid">
          {sorted.map((entry) => (
            <div
              key={entry.path}
              className={`file-card ${selectedEntries.has(entry.path) ? 'selected' : ''}`}
              onClick={() => handleNavigate(entry.path, entry.type)}
              onContextMenu={(e) => handleContextMenu(e, entry.path, entry.type)}
            >
              <button
                className="file-card-actions-btn"
                aria-label={`Actions for ${entry.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = clampMenuPos(rect.right, rect.bottom);
                  setContextMenu({ x: pos.x, y: pos.y, path: entry.path, type: entry.type });
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3.5" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="8" cy="12.5" r="1.3" />
                </svg>
              </button>
              <div className={`file-card-icon ${entry.type === 'directory' ? 'folder' : 'file'}`}>
                <FileIcon type={entry.type} extension={entry.extension} size={32} />
              </div>
              <div className="file-card-name">{entry.name}</div>
              <div className="file-card-meta">
                {entry.type === 'directory' ? 'Folder' : formatBytes(entry.size)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="file-list-wrap">
          <table className="file-list">
            <thead>
              <tr>
                <th style={{ width: '50%' }}>Name</th>
                <th>Size</th>
                <th>Modified</th>
                <th style={{ width: 60 }}>Type</th>
                <th style={{ width: 40 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr
                  key={entry.path}
                  className={selectedEntries.has(entry.path) ? 'selected' : ''}
                  onClick={() => handleNavigate(entry.path, entry.type)}
                  onContextMenu={(e) => handleContextMenu(e, entry.path, entry.type)}
                >
                  <td>
                    <div className="file-list-name">
                      <span className={`file-list-name-icon ${entry.type === 'directory' ? 'folder' : 'file'}`}>
                        <FileIcon type={entry.type} extension={entry.extension} size={18} />
                      </span>
                      {entry.name}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-tertiary)' }}>
                    {entry.type === 'directory' ? '—' : formatBytes(entry.size)}
                  </td>
                  <td style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                    {entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : '—'}
                  </td>
                  <td style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                    {entry.type === 'directory' ? 'Folder' : entry.extension || 'File'}
                  </td>
                  <td>
                    <button
                      className="file-card-actions-btn"
                      aria-label={`Actions for ${entry.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pos = clampMenuPos(rect.right, rect.bottom);
                        setContextMenu({ x: pos.x, y: pos.y, path: entry.path, type: entry.type });
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="8" cy="3.5" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="8" cy="12.5" r="1.3" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.type !== 'directory' && (
            <button className="context-menu-item" onClick={() => { handleNavigate(contextMenu.path, contextMenu.type); setContextMenu(null); }}>
              Preview
            </button>
          )}
          {contextMenu.type !== 'directory' && (
            <button className="context-menu-item" onClick={() => handleDownload(contextMenu.path)}>
              Download
            </button>
          )}
          <div className="context-menu-sep" />
          <button className="context-menu-item danger" onClick={() => handleDelete(contextMenu.path)}>
            Delete
          </button>
        </div>
      )}
    </>
  );
}