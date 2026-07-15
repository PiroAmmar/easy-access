import { getAllActivities } from '@/db/queries';
import { auth } from '@/lib/auth';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const session = await auth();
  const adminId = session?.user?.id;
  const isAdmin = session?.user?.role === 'admin';
  const activities = await getAllActivities(100, adminId, isAdmin);

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Recent file operations across all servers' : 'Recent file operations on your servers'}
          </p>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
              <path d="M2 10H5L7 4L10 16L13 8L15 10H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="empty-state-title">No activity yet</div>
          <div className="empty-state-text">File operations (reads, writes, deletes) will appear here.</div>
        </div>
      ) : (
        <div style={{ width: '100%', overflowX: 'auto' }}>
        <table className="file-list" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Path</th>
              <th>Server</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="badge badge-action">{a.type}</span>
                </td>
                <td>
                  <span className="truncate font-mono" style={{ display: 'block', maxWidth: 400, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {a.path}
                  </span>
                </td>
                <td>
                  {a.serverName ? (
                    <Link href={`/dashboard/servers/${a.serverId}`} style={{ fontSize: 'var(--text-sm)' }}>
                      {a.serverName}
                    </Link>
                  ) : (
                    <span className="text-tertiary" style={{ fontSize: 'var(--text-sm)' }}>{a.serverId}</span>
                  )}
                </td>
                <td className="activity-time">
                  {new Date(a.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  );
}
