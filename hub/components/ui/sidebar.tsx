'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

interface SidebarProps {
  userName?: string | null;
  role?: string | null;
  open?: boolean;
  onNavigate?: () => void;
}

export default function Sidebar({ userName, role, open, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === 'admin';

  const navItems = [
    {
      label: 'Overview',
      href: '/dashboard',
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="2" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="11" y="2" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="2" y="11" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="11" y="11" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      label: 'Servers',
      href: '/dashboard/servers',
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="3" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="2" y="12" width="16" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="5" cy="5.5" r="1" fill="currentColor" />
          <circle cx="5" cy="14.5" r="1" fill="currentColor" />
        </svg>
      ),
    },
    {
      label: 'Files',
      href: '/dashboard/files',
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M3 4C3 3.44772 3.44772 3 4 3H8L10 5H16C16.5523 5 17 5.44772 17 6V16C17 16.5523 16.5523 17 16 17H4C3.44772 17 3 16.5523 3 16V4Z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      label: 'Activity',
      href: '/dashboard/activity',
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M2 10H5L7 4L10 16L13 8L15 10H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    ...(isAdmin
      ? [
          {
            label: 'Users',
            href: '/dashboard/users',
            icon: (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="7" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="14.5" cy="7.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12.5 12c2 .2 3.7 1.7 3.9 4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ),
          },
        ]
      : []),
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L18 7V13L10 18L2 13V7L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="10" cy="10" r="2" fill="currentColor" opacity="0.6" />
          </svg>
        </div>
        <span className="sidebar-brand-name">Easy Access</span>
      </div>

      {/* Simple divider instead of uppercase eyebrow */}
      <div className="sidebar-nav-divider" />

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {(userName ?? 'A').charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName ?? 'Account'}</div>
            <div className="sidebar-user-role">{isAdmin ? 'Administrator' : 'User'}</div>
          </div>
          <Link
            href="/dashboard/account"
            onClick={onNavigate}
            className="topbar-btn"
            title="Change password"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 7V4.75C5.5 3.23122 6.73122 2 8.25 2C9.76878 2 11 3.23122 11 4.75V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Link>
          <button
            className="topbar-btn"
            onClick={async () => {
              await signOut({ redirect: false });
              window.location.href = '/login';
            }}
            title="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10 11L13 8L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}