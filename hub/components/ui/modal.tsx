'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function Modal({ open, onClose, title, children, maxWidth = '480px' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Horizontal center point (px from viewport left) the modal should sit on.
  // Defaults to plain viewport center until measured, then locks onto the
  // actual visible content area so it centers correctly regardless of
  // sidebar width, window size, DevTools, or breakpoint.
  const [centerX, setCenterX] = useState<string>('50vw');

  useEffect(() => {
    if (!open) return;

    const recalc = () => {
      const content = document.querySelector('.dashboard-content');
      if (content) {
        const rect = content.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        console.log('[Modal centering] .dashboard-content rect:', rect, '→ centerX:', x);
        setCenterX(`${x}px`);
      } else {
        console.log('[Modal centering] .dashboard-content NOT FOUND — falling back to 50vw');
        setCenterX('50vw');
      }
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === dialogRef.current) onClose();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
      style={{ maxWidth, left: centerX }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M5 15L15 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}