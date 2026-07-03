'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './sidebar';

interface DashboardShellProps {
  userName?: string | null;
  children: React.ReactNode;
}

const breadcrumbMap: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/servers': 'Servers',
  '/dashboard/files': 'Files',
  '/dashboard/activity': 'Activity',
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

export default function DashboardShell({ userName, children }: DashboardShellProps) {
  const pathname = usePathname();
  const { parent, current } = getBreadcrumb(pathname);

  return (
    <div className="dashboard-layout">
      <Sidebar userName={userName} />
      <header className="topbar">
        <div className="topbar-left">
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
    </div>
  );
}
