interface FileIconProps {
  type: 'file' | 'directory' | 'symlink';
  extension?: string;
  size?: number;
}

export default function FileIcon({ type, extension = '', size = 24 }: FileIconProps) {
  if (type === 'directory') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="folder">
        <path d="M3 6C3 5.44772 3.44772 5 4 5H9L11 7H20C20.5523 7 21 7.44772 21 8V19C21 19.5523 20.5523 20 20 20H4C3.44772 20 3 19.5523 3 19V6Z" fill="rgba(245,158,11,0.15)" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  const ext = extension.toLowerCase();

  // Spreadsheet
  if (['.xlsx', '.xls', '.csv', '.ods'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="rgba(34,197,94,0.1)" stroke="#22c55e" strokeWidth="1.5" />
        <path d="M8 9H16M8 12H16M8 15H12" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // Document
  if (['.docx', '.doc', '.odt', '.rtf'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="rgba(59,130,246,0.1)" stroke="#3b82f6" strokeWidth="1.5" />
        <path d="M8 8H16M8 11H16M8 14H13" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // PDF
  if (ext === '.pdf') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="rgba(239,68,68,0.1)" stroke="#ef4444" strokeWidth="1.5" />
        <path d="M8 12H16M8 15H12" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
        <text x="12" y="10" textAnchor="middle" fontSize="6" fill="#ef4444" fontWeight="bold">PDF</text>
      </svg>
    );
  }

  // Image
  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="rgba(168,85,247,0.1)" stroke="#a855f7" strokeWidth="1.5" />
        <circle cx="9" cy="9" r="2" stroke="#a855f7" strokeWidth="1.5" />
        <path d="M4 16L8 12L12 16L16 11L20 16" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Code
  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.yaml', '.yml', '.toml', '.xml', '.sh', '.bat', '.ps1'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="rgba(14,165,233,0.1)" stroke="#0ea5e9" strokeWidth="1.5" />
        <path d="M9 9L7 12L9 15" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 9L17 12L15 15" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Archive
  if (['.zip', '.tar', '.gz', '.rar', '.7z'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="rgba(245,158,11,0.1)" stroke="#f59e0b" strokeWidth="1.5" />
        <path d="M12 8V16M9 12H15" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // Generic file
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 3H6C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V8L14 3Z" fill="rgba(148,163,184,0.08)" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 3V8H19" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
