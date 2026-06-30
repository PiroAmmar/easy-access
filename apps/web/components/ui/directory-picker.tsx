'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/modal';

interface DirectoryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

interface DirData {
  name: string;
  path: string;
}

export default function DirectoryPicker({ open, onClose, onSelect }: DirectoryPickerProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const fetchDirs = async (pathQuery?: string) => {
    setLoading(true);
    setError('');
    try {
      const url = pathQuery ? `/api/local-fs?path=${encodeURIComponent(pathQuery)}` : '/api/local-fs';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load directory contents');
      }
      const data = await res.json();
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setDirectories(data.directories || []);
    } catch (err: any) {
      setError(err.message || 'Error loading directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCurrentPath('');
      fetchDirs(undefined); // Always start at OS home directory
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Browse Local Directories" maxWidth="500px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minHeight: '300px' }}>
        
        {/* Current Path & Up Button */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => parentPath && fetchDirs(parentPath)}
            disabled={!parentPath || loading}
            title="Go up"
            style={{ padding: 'var(--space-2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 14V6M10 6L6 10M10 6L14 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div 
            className="form-input" 
            style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={currentPath}
          >
            {currentPath || 'Loading...'}
          </div>
        </div>

        {/* Directory List */}
        <div style={{ 
          flex: 1, 
          border: '1px solid var(--surface-border)', 
          borderRadius: 'var(--radius-md)', 
          background: 'rgba(0,0,0,0.1)',
          overflowY: 'auto',
          maxHeight: '300px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-tertiary)', padding: 'var(--space-8)' }}>
              <span className="spinner" style={{ marginRight: 'var(--space-2)' }} /> Loading...
            </div>
          ) : error ? (
            <div style={{ color: 'var(--color-danger)', padding: 'var(--space-4)', textAlign: 'center' }}>
              {error}
            </div>
          ) : directories.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', padding: 'var(--space-4)', textAlign: 'center' }}>
              No subdirectories found.
            </div>
          ) : (
            directories.map((dir) => (
              <button
                key={dir.path}
                type="button"
                onClick={() => fetchDirs(dir.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  width: '100%',
                  padding: 'var(--space-2) var(--space-4)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--surface-border-hover)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background var(--transition-fast)'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--color-brand-400)', flexShrink: 0 }}>
                  <path d="M3 4C3 3.44772 3.44772 3 4 3H8L10 5H16C16.5523 5 17 5.44772 17 6V16C17 16.5523 16.5523 17 16 17H4C3.44772 17 3 16.5523 3 16V4Z" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span style={{ fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dir.name}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="modal-footer" style={{ padding: '0', borderTop: 'none', marginTop: 'auto' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button 
            className="btn btn-primary" 
            disabled={!currentPath || loading}
            onClick={() => {
              if (currentPath) {
                onSelect(currentPath);
                onClose();
              }
            }}
          >
            Select Current Folder
          </button>
        </div>
      </div>
    </Modal>
  );
}
