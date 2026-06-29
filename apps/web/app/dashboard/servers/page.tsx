'use client';

import { useEffect, useState } from 'react';
import { useServerStore } from '@/lib/stores/server-store';
import ServerCard from '@/components/server/server-card';
import AddServerModal from '@/components/server/add-server-modal';

export default function ServersPage() {
  const { servers, isLoading, error, fetchServers, addServer, removeServer } = useServerStore();
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const handleAdd = async (data: { name: string; description?: string; allowedDirs: string[] }) => {
    const server = await addServer(data);
    return { agentToken: server.agentToken };
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Servers</h1>
          <p className="page-subtitle">Manage your connected machines</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Add Server
          </button>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {isLoading ? (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-xl)' }} />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="12" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="empty-state-title">No servers registered</div>
          <div className="empty-state-text">
            Add a server to start managing files remotely. You&apos;ll receive an agent token to install on the remote machine.
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add Your First Server</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              isOnline={server.isOnline}
              onDelete={removeServer}
            />
          ))}
        </div>
      )}

      <AddServerModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} />
    </>
  );
}
