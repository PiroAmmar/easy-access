import { getAllServers } from '@/db/queries';
import { getAllActivities } from '@/db/queries';
import { connectionManager } from '@/lib/connection-manager';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [servers, activities] = await Promise.all([
    getAllServers(),
    getAllActivities(10),
  ]);

  const onlineIds = connectionManager.getOnlineServerIds();
  const onlineCount = servers.filter((s) => onlineIds.includes(s.id)).length;
  const offlineCount = servers.length - onlineCount;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Connected servers and recent activity</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-brand">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="12" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="stat-label">Total Servers</div>
          <div className="stat-value">{servers.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-success">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 10L9 12L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-label">Online</div>
          <div className="stat-value">{onlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-warning">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 7V10M10 13H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="stat-label">Offline</div>
          <div className="stat-value">{offlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-brand">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M2 10H5L7 4L10 16L13 8L15 10H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-label">Recent Actions</div>
          <div className="stat-value">{activities.length}</div>
        </div>
      </div>

      {/* Two-column: Servers + Activity */}
      <div className="two-col-grid">
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Servers</h2>
            <Link href="/dashboard/servers" className="btn btn-ghost btn-sm">View all</Link>
          </div>
          {servers.length === 0 ? (
            <div className="card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-1)' }}>Welcome to Easy Access!</h3>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Follow these steps to connect your first machine and start managing files.</p>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--interactive-brand-bg)', color: 'var(--color-brand-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', flexShrink: 0 }}>1</div>
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>Add a Server</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px', marginBottom: 'var(--space-2)' }}>Click the button below to register a new machine and get an Agent Token.</div>
                    <Link href="/dashboard/servers" className="btn btn-primary btn-sm">Add Server</Link>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', flexShrink: 0 }}>2</div>
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>Install the Agent</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>On the machine you want to access, install the Easy Access Agent using Node.js.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', flexShrink: 0 }}>3</div>
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>Connect</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>Run the agent setup and paste your Agent Token when prompted. It will instantly appear online here.</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="item-list">
              {servers.slice(0, 5).map((server) => {
                const isOnline = onlineIds.includes(server.id);
                return (
                  <Link
                    key={server.id}
                    href={`/dashboard/servers/${server.id}`}
                    className="activity-row"
                    style={{ textDecoration: 'none' }}
                  >
                    <span className={isOnline ? 'badge badge-online' : 'badge badge-offline'}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                    <span style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', flex: 1 }}>{server.name}</span>
                    {server.os && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{server.os}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Recent Activity</h2>
            <Link href="/dashboard/activity" className="btn btn-ghost btn-sm">View all</Link>
          </div>
          {activities.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-title">No activity yet</div>
              <div className="empty-state-text">File operations will appear here.</div>
            </div>
          ) : (
            <div className="item-list">
              {activities.map((activity) => (
                <div key={activity.id} className="activity-row">
                  <span className="badge badge-action">{activity.type}</span>
                  <span className="activity-path">{activity.path}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
