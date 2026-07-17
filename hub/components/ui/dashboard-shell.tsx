'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './sidebar';
import GlobalFeedback from './feedback';

interface DashboardShellProps {
  userName?: string | null;
  role?: string | null;
  children: React.ReactNode;
}

const breadcrumbMap: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/servers': 'Servers',
  '/dashboard/files': 'Files',
  '/dashboard/activity': 'Activity',
  '/dashboard/users': 'Users',
  '/dashboard/account': 'Account',
};

function getBreadcrumb(pathname: string): { parent?: string; current: string } {
  // Exact match
  if (breadcrumbMap[pathname]) {
    return { current: breadcrumbMap[pathname] };
  }

  // Server detail: /dashboard/servers/[id]
  if (pathname.startsWith('/dashboard/servers/')) {
    return { parent: 'Servers', current: 'Details' };
  }

  // Files with query
  if (pathname.startsWith('/dashboard/files')) {
    return { parent: 'Files', current: 'Browse' };
  }

  return { current: 'Dashboard' };
}

export default function DashboardShell({ userName, role, children }: DashboardShellProps) {
  const pathname = usePathname();
  const { parent, current } = getBreadcrumb(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the mobile sidebar whenever the route changes (e.g. after tapping a nav link)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Prevent background scroll while the mobile sidebar overlay is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  return (
    <div className="dashboard-layout">
      <Sidebar userName={userName} role={role} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={sidebarOpen}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
            {parent && (
              <>
                <span>{parent}</span>
                <span className="topbar-breadcrumb-sep" aria-hidden="true">/</span>
              </>
            )}
            <span className="topbar-breadcrumb-current">{current}</span>
          </nav>
        </div>
        <div className="topbar-right">
          {/* Future: notification bell, search */}
        </div>
      </header>
      <main className="dashboard-content">
        {children}
      </main>
      <GlobalFeedback />
    </div>
  );
}