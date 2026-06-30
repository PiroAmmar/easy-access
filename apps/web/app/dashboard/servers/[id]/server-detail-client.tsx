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
                Update your agent&apos;s config.json on the remote machine and restart the agent to allow directories.
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
          🔒 To modify allowed directories, edit the <code>config.json</code> file directly on the remote machine and restart the agent.
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
