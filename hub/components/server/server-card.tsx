'use client';

import Link from 'next/link';
import type { Server } from '@easy-access/shared';

interface ServerCardProps {
  server: Server;
  isOnline: boolean;
  onDelete?: (id: string) => void;
}

export default function ServerCard({ server, isOnline, onDelete }: ServerCardProps) {
  const diskUsage = server.diskUsage;
  const diskPercent = diskUsage && diskUsage.totalGb > 0
    ? Math.round((diskUsage.usedGb / diskUsage.totalGb) * 100)
    : null;

  const diskLevel = diskPercent !== null
    ? diskPercent > 90 ? 'high' : diskPercent > 70 ? 'medium' : 'low'
    : 'low';

  return (
    <div className="server-card">
      {/* Header row */}
      <div className="server-card-header">
        <div className="server-card-identity">
          {/* Status indicator icon */}
          <div className={`server-card-status-dot ${isOnline ? 'online' : 'offline'}`} />
          <div>
            <Link
              href={`/dashboard/servers/${server.id}`}
              className="server-card-name"
            >
              {server.name}
            </Link>
            {server.description && (
              <div className="server-card-desc">{server.description}</div>
            )}
          </div>
        </div>
        <span className={isOnline ? 'badge badge-online' : 'badge badge-offline'}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Meta row */}
      <div className="server-card-meta">
        {server.os && <span>{server.os}</span>}
        <span>{server.allowedDirs.length} dir{server.allowedDirs.length !== 1 ? 's' : ''}</span>
        {server.lastSeen && (
          <span>Last seen {new Date(server.lastSeen).toLocaleString()}</span>
        )}
      </div>

      {/* Disk usage */}
      {diskUsage && diskPercent !== null && (
        <div className="server-card-disk">
          <div className="server-card-disk-header">
            <span>Disk</span>
            <span>{diskUsage.usedGb.toFixed(1)} / {diskUsage.totalGb.toFixed(1)} GB ({diskPercent}%)</span>
          </div>
          <div className="disk-bar">
            <div className={`disk-bar-fill ${diskLevel}`} style={{ width: `${diskPercent}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="server-card-actions">
        {isOnline && (
          <Link href={`/dashboard/files?serverId=${server.id}&path=${encodeURIComponent(server.allowedDirs[0] ?? '/')}`} className="btn btn-ghost btn-sm">
            Browse Files
          </Link>
        )}
        <Link href={`/dashboard/servers/${server.id}`} className="btn btn-ghost btn-sm">
          Details
        </Link>
        {onDelete && (
          <button
            className="btn btn-danger btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => { if (confirm(`Delete server "${server.name}"?`)) onDelete(server.id); }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
