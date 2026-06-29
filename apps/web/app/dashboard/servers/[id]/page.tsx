import { notFound } from 'next/navigation';
import { getServerById, getServerActivities } from '@/db/queries';
import { connectionManager } from '@/lib/connection-manager';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const server = await getServerById(id);
  return { title: server?.name ?? 'Server' };
}

export default async function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = await getServerById(id);
  if (!server) notFound();

  const activities = await getServerActivities(id, 20);
  const isOnline = connectionManager.isOnline(id);
  const disk = server.diskUsage;
  const diskPercent = disk && disk.totalGb > 0 ? Math.round((disk.usedGb / disk.totalGb) * 100) : null;
  const diskLevel = diskPercent !== null ? (diskPercent > 90 ? 'high' : diskPercent > 70 ? 'medium' : 'low') : 'low';

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/dashboard/servers" className="backlink">
            ← Servers
          </Link>
          <h1 className="page-title">{server.name}</h1>
          {server.description && <p className="page-subtitle">{server.description}</p>}
        </div>
        <div className="page-header-right">
          <span className={isOnline ? 'badge badge-online' : 'badge badge-offline'}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {isOnline && server.allowedDirs.length > 0 && (
            <Link href={`/dashboard/files?serverId=${id}&path=${encodeURIComponent(server.allowedDirs[0])}`} className="btn btn-primary btn-sm">
              Browse Files
            </Link>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Operating System</div>
          <div className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>
            {server.os ?? 'Unknown'}
          </div>
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

      {/* Allowed Dirs */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Allowed Directories</h2>
        </div>
        <div className="item-list">
          {server.allowedDirs.map((dir, i) => (
            <div key={i} className="dir-row">
              <span className="dir-path">{dir}</span>
              {isOnline && (
                <Link href={`/dashboard/files?serverId=${id}&path=${encodeURIComponent(dir)}`} className="btn btn-ghost btn-sm">
                  Browse
                </Link>
              )}
            </div>
          ))}
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
