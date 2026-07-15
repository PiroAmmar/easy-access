'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Server {
  id: string;
  name: string;
  description?: string;
  os?: string;
  lastSeen?: string;
  allowedDirs: string[];
  isOnline: boolean;
  agentToken?: string;
  diskUsage?: { usedGb: number; totalGb: number; freeGb: number };
}

interface Activity {
  id: string;
  type: string;
  path: string;
  createdAt: string;
}

export default function ServerDetailClient({ serverId }: { serverId: string }) {
  const [server, setServer] = useState<Server | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);

  const load = async () => {
    setLoading(true);
    const [sRes, aRes] = await Promise.all([
      fetch(`/api/servers/${serverId}`),
      fetch(`/api/servers/${serverId}/activities`),
    ]);
    if (sRes.ok) {
      const sData = await sRes.json();
      setServer(sData.data);
    }
    if (aRes.ok) {
      const aData = await aRes.json();
      setActivities(aData.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [serverId]);

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-xl)' }} />
        ))}
      </div>
    );
  }

  if (!server) {
    return <div style={{ color: 'var(--color-danger)' }}>Server not found.</div>;
  }

  const disk = server.diskUsage;
  const diskPercent = disk && disk.totalGb > 0 ? Math.round((disk.usedGb / disk.totalGb) * 100) : null;
  const diskLevel = diskPercent !== null ? (diskPercent > 90 ? 'high' : diskPercent > 70 ? 'medium' : 'low') : 'low';

  const copyToken = async () => {
    if (!server?.agentToken) return;
    await navigator.clipboard.writeText(server.agentToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/dashboard/servers" className="backlink">← Servers</Link>
          <h1 className="page-title">{server.name}</h1>
          {server.description && <p className="page-subtitle">{server.description}</p>}
        </div>
        <div className="page-header-right">
          <span className={server.isOnline ? 'badge badge-online' : 'badge badge-offline'}>
            {server.isOnline ? 'Online' : 'Offline'}
          </span>
          {server.isOnline && server.allowedDirs.length > 0 && (
            <Link href={`/dashboard/files?serverId=${server.id}&path=${encodeURIComponent(server.allowedDirs[0])}`} className="btn btn-primary btn-sm">
              Browse Files
            </Link>
          )}
        </div>
      </div>

      {/* Offline banner with reconnect instructions */}
      {!server.isOnline && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.07)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4) var(--space-5)',
          marginBottom: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-warning)' }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 3L18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M10 9V12M10 15H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <strong style={{ fontSize: 'var(--text-sm)' }}>This server is offline</strong>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 'var(--leading-relaxed)' }}>
            To bring <strong>{server.name}</strong> back online, run the agent on that machine:
          </p>
          <ol style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', paddingLeft: 'var(--space-5)', margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', lineHeight: 'var(--leading-relaxed)' }}>
            <li>Open a terminal on the <strong>{server.name}</strong> machine inside the <code>agent/</code> folder</li>
            <li>Run: <code style={{ background: 'var(--surface-bg)', padding: '1px 6px', borderRadius: 4 }}>npm start</code></li>
            <li>Open <code>http://localhost:4400</code> and paste the Agent Token below</li>
            <li>Set the Hub WebSocket URL to <code style={{ background: 'var(--surface-bg)', padding: '1px 6px', borderRadius: 4 }}>wss://your-hub.up.railway.app/ws</code></li>
          </ol>
        </div>
      )}

      {/* Info Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Operating System</div>
          <div className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>{server.os ?? 'Unknown'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Seen</div>
          <div className="stat-value" style={{ fontSize: 'var(--text-lg)' }}>
            {server.lastSeen ? new Date(server.lastSeen).toLocaleString() : 'Never'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Allowed Directories</div>
          <div className="stat-value">{server.allowedDirs.length}</div>
        </div>
        {disk && diskPercent !== null && (
          <div className="stat-card">
            <div className="stat-label">Disk Usage</div>
            <div className="stat-value">{diskPercent}%</div>
            <div className="disk-bar" style={{ marginTop: 'var(--space-3)' }}>
              <div className={`disk-bar-fill ${diskLevel}`} style={{ width: `${diskPercent}%` }} />
            </div>
            <div className="stat-sub">{disk.usedGb.toFixed(1)} / {disk.totalGb.toFixed(1)} GB</div>
          </div>
        )}
      </div>

      {/* Agent Token */}
      {server.agentToken && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Agent Token</h2>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)' }}>
            Paste this into the agent setup page at <code>http://localhost:4400</code> on the remote machine.
          </p>
          <div className="copy-field">
            <span className="copy-field-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
              {tokenVisible ? server.agentToken : '••••••••••••••••••••••••••••••••••••••••'}
            </span>
            <button
              className="copy-field-btn"
              onClick={() => setTokenVisible((v) => !v)}
              title={tokenVisible ? 'Hide token' : 'Show token'}
            >
              {tokenVisible ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 3L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </button>
            <button
              className="copy-field-btn"
              onClick={copyToken}
              title="Copy token"
            >
              {tokenCopied ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8L6.5 11.5L13 5" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 5V3.5C11 2.67157 10.3284 2 9.5 2H3.5C2.67157 2 2 2.67157 2 3.5V9.5C2 10.3284 2.67157 11 3.5 11H5" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Allowed Directories */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Allowed Directories</h2>
        </div>

        <div className="item-list">
          {server.allowedDirs.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
              <div className="empty-state-title">No directories configured</div>
              <div className="empty-state-text">
                Update your agent&apos;s config at <code>http://localhost:4400</code> on the remote machine and restart the agent.
              </div>
            </div>
          ) : (
            server.allowedDirs.map((dir, i) => (
              <div key={i} className="dir-row">
                <span className="dir-path">{dir}</span>
                {server.isOnline && (
                  <Link href={`/dashboard/files?serverId=${server.id}&path=${encodeURIComponent(dir)}`} className="btn btn-ghost btn-sm">
                    Browse
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          🔒 To modify allowed directories, update the Shared Folders in the agent setup UI (<code>http://localhost:4400</code>) and reconnect.
        </div>
      </div>

      {/* Activity */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Recent Activity</h2>
        </div>
        {activities.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No activity yet</div>
          </div>
        ) : (
          <div className="item-list">
            {activities.map((a) => (
              <div key={a.id} className="activity-row">
                <span className="badge badge-action">{a.type}</span>
                <span className="activity-path">{a.path}</span>
                <span className="activity-time">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </>
  );
}
