'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';

interface Account {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export default function UsersClient({ currentUserId }: { currentUserId: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Reset password state
  const [resetingId, setResetingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setUsername('');
    setPassword('');
    setRole('user');
    setError(null);
    setCreateOpen(true);
  };

  const createAccount = async () => {
    setError(null);
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to create user');
        return;
      }
      setCreateOpen(false);
      load();
    } catch {
      setError('Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error ?? 'Failed to delete user');
        return;
      }
      load();
    } finally {
      setDeletingId(null);
    }
  };

  const resetPassword = async (account: Account) => {
    if (!confirm(`Reset password for "${account.username}"? Their current password will stop working immediately.`)) return;
    setResetingId(account.id);
    try {
      const res = await fetch(`/api/users/${account.id}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error ?? 'Failed to reset password');
        return;
      }
      setCopied(false);
      setResetResult({ username: account.username, password: data.data.newPassword });
    } catch {
      alert('Failed to reset password');
    } finally {
      setResetingId(null);
    }
  };

  const copyPassword = async () => {
    if (!resetResult) return;
    await navigator.clipboard.writeText(resetResult.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Manage who can sign in. Regular users only see their own servers and activity.</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary btn-sm" onClick={openCreate}>Add User</button>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-xl)' }} />
      ) : (
        <div className="item-list">
          {accounts.map((a) => (
            <div key={a.id} className="activity-row">
              <span className={a.role === 'admin' ? 'badge badge-action' : 'badge'}>
                {a.role === 'admin' ? 'Admin' : 'User'}
              </span>
              <span style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', flex: 1 }}>
                {a.username}
                {a.id === currentUserId && (
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 'var(--font-normal)' }}> (you)</span>
                )}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                Joined {new Date(a.createdAt).toLocaleDateString()}
              </span>
              {a.id !== currentUserId && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => resetPassword(a)}
                    disabled={resetingId === a.id}
                    title="Generate a new password for this user"
                  >
                    {resetingId === a.id ? 'Resetting...' : 'Reset Password'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (confirm(`Delete user "${a.username}"? This cannot be undone.`)) {
                        deleteAccount(a.id);
                      }
                    }}
                    disabled={deletingId === a.id}
                    style={{ color: 'var(--color-danger)' }}
                  >
                    {deletingId === a.id ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create User Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add User" maxWidth="420px">
        <div className="form-group">
          <label className="form-label">Username</label>
          <input
            className="form-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. jsmith"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <select
            className="form-input"
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
          >
            <option value="user">User — sees only their own servers &amp; activity</option>
            <option value="admin">Admin — full access to everything</option>
          </select>
        </div>

        {error && (
          <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={createAccount} disabled={saving}>
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </Modal>

      {/* Reset Password Result Modal */}
      <Modal
        open={resetResult !== null}
        onClose={() => setResetResult(null)}
        title="Password Reset"
        maxWidth="420px"
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
          A new password has been generated for{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{resetResult?.username}</strong>.
          Share it with them and ask them to change it after logging in.
        </p>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}>
          <code style={{
            flex: 1,
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: 'var(--text-base)',
            letterSpacing: '0.05em',
            color: 'var(--text-primary)',
            userSelect: 'all',
          }}>
            {resetResult?.password}
          </code>
          <button
            className="btn btn-secondary btn-sm"
            onClick={copyPassword}
            style={{ flexShrink: 0 }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-4)' }}>
          This password will not be shown again after you close this dialog.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={() => setResetResult(null)}>Done</button>
        </div>
      </Modal>
    </>
  );
}
