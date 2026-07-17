'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './spreadsheet.module.css';

// ─── RibbonButton ─────────────────────────────────────────────────────────────

interface RibbonButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function RibbonButton({ children, onClick, active, disabled, title, className }: RibbonButtonProps) {
  let cls = styles.ribbonBtn;
  if (active) cls += ' ' + styles.ribbonBtnActive;
  if (disabled) cls += ' ' + styles.ribbonBtnDisabled;
  if (className) cls += ' ' + className;
  return (
    <button
      className={cls}
      onClick={disabled ? undefined : onClick}
      title={title}
      type="button"
      style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
    >
      {children}
    </button>
  );
}

// ─── RibbonDropdown ───────────────────────────────────────────────────────────

interface DropdownItem {
  label: string;
  value: string;
}

interface RibbonDropdownProps {
  label?: React.ReactNode;
  items: DropdownItem[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  title?: string;
  selectedValue?: string;
  minWidth?: number;
}

export function RibbonDropdown({ label, items, onSelect, disabled, title, selectedValue, minWidth }: RibbonDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={styles.ribbonDropdown} ref={ref} style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
      <button
        className={styles.ribbonBtn}
        onClick={() => setOpen(o => !o)}
        title={title}
        type="button"
        style={{ minWidth: minWidth ?? 60, justifyContent: 'space-between', gap: 4 }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label ?? (selectedValue ?? '')}
        </span>
        <span style={{ fontSize: 8, flexShrink: 0 }}>▼</span>
      </button>
      {open && (
        <div className={styles.ribbonDropdownMenu} style={{ minWidth: minWidth ?? 120 }}>
          {items.map(item => (
            <button
              key={item.value}
              className={styles.ribbonDropdownItem}
              onClick={() => { onSelect(item.value); setOpen(false); }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ColorPicker ──────────────────────────────────────────────────────────────

const PALETTE: string[] = [
  // Row 1
  '#ffffff','#000000','#e7e6e6','#44546a','#4472c4','#ed7d31','#a9d18e','#ff0000','#ffc000','#ffff00',
  // Row 2
  '#f2f2f2','#7f7f7f','#d0cece','#d6dce4','#dae3f3','#fce4d6','#e2efda','#ffd7d5','#fff2cc','#ffffcc',
  // Row 3
  '#d9d9d9','#595959','#aeaaaa','#adb9ca','#b4c7e7','#f8cbad','#c6e0b4','#ff9999','#ffe699','#ffff99',
  // Row 4
  '#bfbfbf','#404040','#757070','#8496b0','#9dc3e6','#f4b183','#a9d18e','#ff6666','#ffcc66','#ffff66',
  // Row 5
  '#a6a6a6','#262626','#3a3838','#333f4f','#2f75b6','#c55a11','#538135','#cc0000','#e6a817','#cccc00',
  // Row 6
  '#808080','#0d0d0d','#171616','#222a35','#1f4e79','#843c0c','#375623','#990000','#9c6500','#969600',
];

interface ColorPickerProps {
  onSelect: (color: string) => void;
  onClose: () => void;
}

export function ColorPicker({ onSelect, onClose }: ColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={styles.colorPicker}
      style={{ position: 'absolute', top: '100%', left: 0, zIndex: 2000 }}
    >
      {PALETTE.map((color, i) => (
        <div
          key={i}
          className={styles.colorSwatch}
          style={{ backgroundColor: color }}
          title={color}
          onMouseDown={(e) => { e.preventDefault(); onSelect(color); onClose(); }}
        />
      ))}
    </div>
  );
}

// ─── SplitButton ──────────────────────────────────────────────────────────────

interface SplitButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  dropdownItems: DropdownItem[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  title?: string;
}

export function SplitButton({ children, onClick, dropdownItems, onSelect, disabled, title }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  return (
    <div
      ref={ref}
      className={styles.ribbonDropdown}
      style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <button
          className={styles.ribbonBtn}
          onClick={disabled ? undefined : onClick}
          title={title}
          type="button"
          style={{ borderRight: 0, borderRadius: '2px 0 0 2px' }}
        >
          {children}
        </button>
        <button
          className={styles.ribbonBtn}
          onClick={() => setOpen(o => !o)}
          type="button"
          style={{ minWidth: 14, padding: '0 2px', borderRadius: '0 2px 2px 0', fontSize: 8 }}
        >
          ▼
        </button>
      </div>
      {open && (
        <div className={styles.ribbonDropdownMenu}>
          {dropdownItems.map(item => (
            <button
              key={item.value}
              className={styles.ribbonDropdownItem}
              onClick={() => { onSelect(item.value); setOpen(false); }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
