'use client';

import { useState } from 'react';
import Modal from '@/components/ui/modal';

interface AddServerModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: { name: string; description?: string; allowedDirs: string[] }) => Promise<{ agentToken: string }>;
}

export default function AddServerModal({ open, onClose, onAdd }: AddServerModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dirsInput, setDirsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const allowedDirs = dirsInput.split('\n').map((d) => d.trim()).filter(Boolean);

    if (!name.trim()) {
      setError('Server name is required');
      setIsSubmitting(false);
      return;
    }

    // Default to root if no dirs provided — can be edited after agent connects
    const dirs = allowedDirs.length > 0 ? allowedDirs : [process.platform === 'win32' ? 'C:\\' : '/home'];

    try {
      const result = await onAdd({ name: name.trim(), description: description.trim() || undefined, allowedDirs: dirs });
      setToken(result.agentToken);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setDirsInput('');
    setError('');
    setToken(null);
    setCopied(false);
    onClose();
  };

  const copyToken = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={handleClose} title={token ? 'Server Created' : 'Add Server'} maxWidth="520px">
      {token ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--color-success)', fontSize: 'var(--text-sm)' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Server &quot;{name}&quot; created successfully!
          </div>
          <div>
            <label className="form-label" style={{ marginBottom: 'var(--space-2)', display: 'block' }}>Agent Token</label>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
              To connect this server, run the agent using this token.
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', marginBottom: 'var(--space-2)' }}>
              ⚠ Copy this token now — it won&apos;t be shown again.
            </p>
            <div className="copy-field">
              <span className="copy-field-value">{token}</span>
              <button className="copy-field-btn" onClick={copyToken} title="Copy token">
                {copied ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 8L7 11L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3 11V3H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                )}
              </button>
            </div>
          </div>
          <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
            <button className="btn btn-primary" onClick={handleClose}>Done</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {error && <div className="auth-error">{error}</div>}
          <div className="form-group">
            <label className="form-label" htmlFor="server-name">Server Name *</label>
            <input id="server-name" className="form-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office PC, Home Server" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="server-desc">Description</label>
            <input id="server-desc" className="form-input" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="server-dirs">Allowed Directories <span style={{ color: 'var(--text-tertiary)', fontWeight: 'normal' }}>(optional)</span></label>
            <textarea
              id="server-dirs"
              className="form-input"
              style={{ minHeight: '80px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
              value={dirsInput}
              onChange={(e) => setDirsInput(e.target.value)}
              placeholder={'One directory per line, e.g.:\nC:\\Users\\YourName\\Documents\nD:\\Projects'}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              These directories will be included in the initial configuration script. To change them later, you must edit the <code>config.json</code> on the remote machine.
            </span>
          </div>
          <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? <><span className="spinner" /> Creating...</> : 'Create Server'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
