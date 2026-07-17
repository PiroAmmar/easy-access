'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatBytes } from '@easy-access/shared';
import { useFeedbackStore } from '@/lib/stores/feedback-store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileData { content: string; mimeType: string; size: number; }
interface ZipEntry { name: string; size: number; isDir: boolean; }

interface XlsxSheet {
  name: string;
  headers: string[];
  rows: string[][];
}

interface PptSlide {
  index: number;
  /** key in the fflate files map, e.g. "ppt/slides/slide1.xml" */
  key: string;
  /** All text runs extracted from <a:t> elements, in order */
  runs: string[];
  /** Editable runs mirror (copy on load, mutated on edit) */
  editRuns: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function b64ToUint8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function b64ToBuffer(b64: string): ArrayBuffer {
  const u8 = b64ToUint8(b64);
  // Ensure we return a plain ArrayBuffer (not SharedArrayBuffer)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
function uint8ToB64(u8: Uint8Array): string {
  // Process in 8 KB chunks to avoid call-stack overflow with btoa on large files
  const CHUNK = 8192;
  let bin = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** POST base64 content back to the server */
async function saveFile(serverId: string, path: string, contentB64: string): Promise<void> {
  const res = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverId, path, action: 'write', content: contentB64, overwrite: true }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Save failed');
}

// ─── ZIP parse ────────────────────────────────────────────────────────────────

async function parseZipEntries(b64: string): Promise<ZipEntry[]> {
  const { unzip } = await import('fflate');
  return new Promise((resolve, reject) => {
    unzip(b64ToUint8(b64), (err, files) => {
      if (err) return reject(err);
      const entries: ZipEntry[] = Object.entries(files).map(([name, data]) => ({
        name, size: data.length, isDir: name.endsWith('/'),
      }));
      entries.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      resolve(entries);
    });
  });
}

// ─── PPTX helpers ────────────────────────────────────────────────────────────

/** Extract <a:t> text contents from one slide XML in order */
function pptxExtractRuns(xml: string): string[] {
  const runs: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) runs.push(m[1]);
  return runs;
}

/** Replace <a:t> contents in slide XML with new values (in order) */
function pptxReplaceRuns(xml: string, newRuns: string[]): string {
  let idx = 0;
  return xml.replace(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g, (match) => {
    if (idx >= newRuns.length) return match;
    const tag = match.match(/^<a:t[^>]*>/)?.[0] ?? '<a:t>';
    return `${tag}${xmlEscape(newRuns[idx++])}</a:t>`;
  });
}

async function parsePptSlides(b64: string): Promise<{ slides: PptSlide[]; allFiles: Record<string, Uint8Array> }> {
  const { unzip } = await import('fflate');
  return new Promise((resolve, reject) => {
    unzip(b64ToUint8(b64), (err, files) => {
      if (err) return reject(err);
      const slideKeys = Object.keys(files)
        .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => {
          const na = parseInt(a.match(/\d+/)![0]);
          const nb = parseInt(b.match(/\d+/)![0]);
          return na - nb;
        });
      const slides: PptSlide[] = slideKeys.map((key, i) => {
        const xml = new TextDecoder().decode(files[key]);
        const runs = pptxExtractRuns(xml);
        return { index: i + 1, key, runs, editRuns: [...runs] };
      });
      resolve({ slides, allFiles: files });
    });
  });
}

async function savePptx(
  allFiles: Record<string, Uint8Array>,
  slides: PptSlide[],
): Promise<Uint8Array> {
  const { zip } = await import('fflate');
  // Apply edits to each slide's XML
  const updatedFiles: Record<string, Uint8Array> = {};
  for (const [key, data] of Object.entries(allFiles)) {
    const slide = slides.find((s) => s.key === key);
    if (slide) {
      const origXml = new TextDecoder().decode(data);
      const newXml = pptxReplaceRuns(origXml, slide.editRuns);
      updatedFiles[key] = new TextEncoder().encode(newXml);
    } else {
      updatedFiles[key] = data;
    }
  }
  return new Promise((resolve, reject) => {
    zip(updatedFiles, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

// ─── Spreadsheet helpers ─────────────────────────────────────────────────────

/** Returns the Excel-style column letter(s) for a 0-indexed column. */
function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

const SHEET_MAX_ROWS = 500;
const SHEET_COL_W    = 110;
const SHEET_ROW_W    = 44;

/** A proper spreadsheet viewer / editor — similar to Google Sheets in feel. */
function SpreadsheetViewer({
  sheets, editSheets, activeSheet, onActiveSheetChange, editing, onCellChange, onHeaderChange, saving, saved, saveError, onSave, onCancelEdit,
}: {
  sheets: XlsxSheet[];
  editSheets: XlsxSheet[];
  activeSheet: number;
  onActiveSheetChange: (i: number) => void;
  editing: boolean;
  onCellChange: (ri: number, ci: number, val: string) => void;
  onHeaderChange: (ci: number, val: string) => void;
  saving: boolean;
  saved: boolean;
  saveError: string;
  onSave: () => void;
  onCancelEdit: () => void;
}) {
  const viewSheets = editing ? editSheets : sheets;
  const sheet = viewSheets[activeSheet] ?? viewSheets[0];

  // Selection / editing state
  const [selRow, setSelRow] = useState(-1); // -1 = header row
  const [selCol, setSelCol] = useState(0);
  const [editRow, setEditRow] = useState<number | null>(null);
  const [editCol, setEditCol] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const inlineRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!sheet) return null;

  const displayRows = sheet.rows.slice(0, SHEET_MAX_ROWS);
  const totalCols = Math.max(
    sheet.headers.length,
    displayRows.reduce((m, r) => Math.max(m, r.length), 0),
    1
  );

  const getCellVal = (row: number, col: number): string =>
    row === -1 ? (sheet.headers[col] ?? '') : (displayRows[row]?.[col] ?? '');

  const commitEdit = () => {
    if (editRow === null || editCol === null) return;
    if (editRow === -1) onHeaderChange(editCol, editVal);
    else onCellChange(editRow, editCol, editVal);
    setEditRow(null);
    setEditCol(null);
  };

  const startEdit = (row: number, col: number, initial?: string) => {
    if (!editing) return;
    // Commit any current edit first (captured from closure — correct for this render)
    if (editRow !== null && editCol !== null) {
      if (editRow === -1) onHeaderChange(editCol, editVal);
      else onCellChange(editRow, editCol, editVal);
    }
    setEditRow(row);
    setEditCol(col);
    setEditVal(initial !== undefined ? initial : getCellVal(row, col));
    requestAnimationFrame(() => { inlineRef.current?.focus(); if (initial === undefined) inlineRef.current?.select(); });
  };

  const selectCell = (row: number, col: number) => {
    commitEdit();
    setSelRow(row);
    setSelCol(col);
    requestAnimationFrame(() => containerRef.current?.focus());
  };

  const moveSelection = (dRow: number, dCol: number) => {
    commitEdit();
    setSelRow((r) => Math.max(-1, Math.min(r + dRow, displayRows.length - 1)));
    setSelCol((c) => Math.max(0, Math.min(c + dCol, totalCols - 1)));
  };

  const handleContainerKey = (e: React.KeyboardEvent) => {
    if (editRow !== null) return; // let inline input handle its own keys
    switch (e.key) {
      case 'ArrowUp':    moveSelection(-1, 0); e.preventDefault(); break;
      case 'ArrowDown':  moveSelection(1, 0);  e.preventDefault(); break;
      case 'ArrowLeft':  moveSelection(0, -1); e.preventDefault(); break;
      case 'ArrowRight': moveSelection(0, 1);  e.preventDefault(); break;
      case 'Tab':        moveSelection(0, e.shiftKey ? -1 : 1); e.preventDefault(); break;
      case 'Enter': case 'F2': if (editing) startEdit(selRow, selCol); e.preventDefault(); break;
      case 'Delete': case 'Backspace':
        if (editing) { if (selRow === -1) onHeaderChange(selCol, ''); else onCellChange(selRow, selCol, ''); }
        break;
      default:
        if (editing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          startEdit(selRow, selCol, e.key); e.preventDefault();
        }
    }
  };

  const handleInlineKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      commitEdit();
      setSelRow((r) => Math.min(r + 1, displayRows.length - 1));
      e.preventDefault();
      requestAnimationFrame(() => containerRef.current?.focus());
    } else if (e.key === 'Tab') {
      const nextCol = selCol + (e.shiftKey ? -1 : 1);
      commitEdit();
      if (nextCol >= 0 && nextCol < totalCols) {
        setSelCol(nextCol);
        requestAnimationFrame(() => startEdit(selRow, nextCol));
      } else {
        requestAnimationFrame(() => containerRef.current?.focus());
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setEditRow(null); setEditCol(null);
      requestAnimationFrame(() => containerRef.current?.focus());
    }
  };

  const cellAddr = selRow === -1 ? `${colLetter(selCol)}1` : `${colLetter(selCol)}${selRow + 2}`;
  const fbarValue = (editRow === selRow && editCol === selCol) ? editVal : getCellVal(selRow, selCol);

  const BD  = '1px solid var(--surface-border)';
  const BD2 = '2px solid var(--surface-border)';
  const BG  = 'var(--surface-elevated)';
  const SEL = '2px solid rgba(99,102,241,0.85)';

  const renderCell = (row: number, col: number, isBold: boolean) => {
    const isHere = selRow === row && selCol === col;
    const isEditingHere = editRow === row && editCol === col;
    const h = isBold ? 28 : 24;
    return (
      <td key={col}
        style={{ borderRight: BD, borderBottom: BD, padding: 0, height: h, width: SHEET_COL_W, minWidth: SHEET_COL_W, maxWidth: SHEET_COL_W, background: isHere ? 'rgba(99,102,241,0.08)' : (isBold ? 'rgba(255,255,255,0.03)' : (!isBold && row % 2 !== 0 ? 'rgba(255,255,255,0.01)' : 'transparent')), outline: isHere && !isEditingHere ? SEL : isEditingHere ? '2px solid #6366f1' : 'none', outlineOffset: -2, position: 'relative', cursor: editing ? 'cell' : 'default', overflow: 'hidden', boxSizing: 'border-box' }}
        onClick={() => selectCell(row, col)}
        onDoubleClick={() => startEdit(row, col)}
      >
        {isEditingHere ? (
          <input
            ref={inlineRef}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={handleInlineKey}
            onBlur={commitEdit}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', outline: 'none', background: 'rgba(99,102,241,0.07)', padding: '0 8px', fontSize: 12, color: 'var(--text-primary)', fontWeight: isBold ? 700 : 400, zIndex: 1, boxSizing: 'border-box' }}
          />
        ) : (
          <div style={{ padding: '0 8px', fontSize: 12, fontWeight: isBold ? 700 : 400, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: `${h}px` }}>
            {getCellVal(row, col)}
          </div>
        )}
      </td>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

      {/* ─ Top action bar ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: '8px 12px', borderBottom: BD2, background: BG, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📊 {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}</span>
          {editing && <span style={{ fontSize: 12, color: 'var(--color-warning)', fontWeight: 600 }}>✏️ Editing</span>}
          {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Saved</span>}
          {saveError && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>✗ {saveError}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : '💾 Save'}</button>
              <button className="btn btn-secondary btn-sm" onClick={onCancelEdit}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => { /* trigger disclaimer via parent */ onSave(); }}>✏️ Edit</button>
          )}
        </div>
      </div>

      {/* ─ Formula bar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: BD2, background: BG, flexShrink: 0, height: 34 }}>
        <div style={{ width: 68, textAlign: 'center', borderRight: BD, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand-300)', flexShrink: 0 }}>
          {cellAddr}
        </div>
        <div style={{ padding: '0 10px', borderRight: BD, height: '100%', display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic', flexShrink: 0 }}>fx</div>
        <input
          value={fbarValue}
          readOnly={!editing}
          onChange={(e) => {
            if (!editing) return;
            setEditVal(e.target.value);
            if (editRow === null) { setEditRow(selRow); setEditCol(selCol); }
          }}
          onFocus={() => { if (editing && editRow === null) { setEditRow(selRow); setEditCol(selCol); setEditVal(getCellVal(selRow, selCol)); } }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { commitEdit(); requestAnimationFrame(() => containerRef.current?.focus()); e.preventDefault(); }
            if (e.key === 'Escape') { setEditRow(null); setEditCol(null); requestAnimationFrame(() => containerRef.current?.focus()); }
          }}
          placeholder={editing ? 'Select a cell to edit…' : ''}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '0 12px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', height: '100%', cursor: editing ? 'text' : 'default' }}
        />
      </div>

      {/* ─ Grid ─────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleContainerKey}
        style={{ overflow: 'auto', maxHeight: '62vh', outline: 'none', position: 'relative' }}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: SHEET_ROW_W, minWidth: SHEET_ROW_W }} />
            {Array.from({ length: totalCols }, (_, ci) => <col key={ci} style={{ width: SHEET_COL_W, minWidth: SHEET_COL_W }} />)}
          </colgroup>
          <thead>
            <tr style={{ height: 24 }}>
              {/* corner */}
              <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 4, background: BG, borderRight: BD2, borderBottom: BD2 }} />
              {Array.from({ length: totalCols }, (_, ci) => (
                <th key={ci} style={{ position: 'sticky', top: 0, zIndex: 3, background: selCol === ci ? 'rgba(99,102,241,0.14)' : BG, borderRight: BD, borderBottom: BD2, fontSize: 11, fontWeight: 700, color: selCol === ci ? 'var(--color-brand-300)' : 'var(--text-tertiary)', textAlign: 'center', letterSpacing: '0.06em', userSelect: 'none' }}>
                  {colLetter(ci)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Header row (row index = -1) */}
            <tr style={{ height: 28 }}>
              <td style={{ position: 'sticky', left: 0, zIndex: 2, background: selRow === -1 ? 'rgba(99,102,241,0.14)' : BG, borderRight: BD2, borderBottom: BD, fontSize: 11, fontWeight: 700, color: selRow === -1 ? 'var(--color-brand-300)' : 'var(--text-tertiary)', textAlign: 'center', userSelect: 'none', width: SHEET_ROW_W, minWidth: SHEET_ROW_W }}>1</td>
              {Array.from({ length: totalCols }, (_, ci) => renderCell(-1, ci, true))}
            </tr>
            {/* Data rows */}
            {displayRows.map((_, ri) => (
              <tr key={ri} style={{ height: 24 }}>
                <td style={{ position: 'sticky', left: 0, zIndex: 2, background: selRow === ri ? 'rgba(99,102,241,0.14)' : BG, borderRight: BD2, borderBottom: BD, fontSize: 11, fontWeight: 700, color: selRow === ri ? 'var(--color-brand-300)' : 'var(--text-tertiary)', textAlign: 'center', userSelect: 'none', width: SHEET_ROW_W, minWidth: SHEET_ROW_W }}>{ri + 2}</td>
                {Array.from({ length: totalCols }, (_, ci) => renderCell(ri, ci, false))}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.rows.length > SHEET_MAX_ROWS && (
          <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-tertiary)', background: BG, borderTop: BD }}>
            Showing {SHEET_MAX_ROWS} of {sheet.rows.length} rows. Download to view all.
          </div>
        )}
      </div>

      {/* ─ Sheet tabs (bottom) ────────────────────────────────────── */}
      {viewSheets.length > 1 && (
        <div style={{ display: 'flex', borderTop: BD2, background: BG, overflowX: 'auto', flexShrink: 0 }}>
          {viewSheets.map((s, i) => (
            <button key={i}
              onClick={() => { commitEdit(); onActiveSheetChange(i); }}
              style={{ padding: '5px 16px', fontSize: 12, border: 'none', borderRight: BD, borderTop: activeSheet === i ? '2px solid var(--color-brand-400)' : '2px solid transparent', background: activeSheet === i ? 'var(--interactive-brand-bg)' : 'transparent', color: activeSheet === i ? 'var(--color-brand-300)' : 'var(--text-tertiary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Disclaimer Modal ─────────────────────────────────────────────────────────

function DisclaimerModal({
  fileName,
  bullets,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  bullets: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, padding: 'var(--space-4)',
    }}>
      <div style={{
        background: 'var(--surface-elevated)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', maxWidth: 480, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--color-danger)' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 3L18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M10 9V12M10 15H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <strong style={{ fontSize: 'var(--text-lg)' }}>Edit Warning</strong>
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 'var(--leading-relaxed)' }}>
          You are about to edit <strong>{fileName}</strong>. Saving will:
        </p>
        <ul style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', paddingLeft: 'var(--space-5)', marginBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', lineHeight: 'var(--leading-relaxed)' }}>
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', marginBottom: 'var(--space-5)', fontWeight: 'var(--font-medium)' }}>
          This cannot be undone. Download a backup first if needed.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={onConfirm}>I understand, edit anyway</button>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar strip used by all editors ───────────────────────────────────────

function EditorToolbar({
  label, saving, onSave, onCancel,
}: {
  label: string; saving: boolean;
  onSave: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      padding: 'var(--space-3) var(--space-4)',
      background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
      borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center',
      flexWrap: 'wrap', gap: 'var(--space-3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-warning)', flex: 1, minWidth: 200 }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M10 3L18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M10 9V12M10 15H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>✏️ Edit Mode</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const searchParams = useSearchParams();
  const serverId = searchParams.get('serverId') ?? '';
  const path = searchParams.get('path') ?? '';
  const fileName = path.split(/[/\\]/).pop() ?? 'Unknown';
  const ext = fileName.includes('.') ? ('.' + fileName.split('.').pop()!.toLowerCase()) : '';

  const [data, setData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Video ────────────────────────────────────────────────────────
  const videoBlobUrl = useRef<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  // ── ZIP ──────────────────────────────────────────────────────────
  const [zipEntries, setZipEntries] = useState<ZipEntry[] | null>(null);
  const [zipError, setZipError] = useState('');
  const [zipSearch, setZipSearch] = useState('');

  // ── DOCX ─────────────────────────────────────────────────────────
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [docRawText, setDocRawText] = useState('');
  const [docError, setDocError] = useState('');
  const [docEditText, setDocEditText] = useState('');
  const [docEditing, setDocEditing] = useState(false);
  const [docDisclaimer, setDocDisclaimer] = useState(false);

  // ── Excel ────────────────────────────────────────────────────────
  const [xlSheets, setXlSheets] = useState<XlsxSheet[]>([]);
  const [xlEditSheets, setXlEditSheets] = useState<XlsxSheet[]>([]);
  const [xlActiveSheet, setXlActiveSheet] = useState(0);
  const [xlError, setXlError] = useState('');
  const [xlEditing, setXlEditing] = useState(false);
  const [xlDisclaimer, setXlDisclaimer] = useState(false);

  // ── PPTX ─────────────────────────────────────────────────────────
  const [pptSlides, setPptSlides] = useState<PptSlide[]>([]);
  const [pptEditSlides, setPptEditSlides] = useState<PptSlide[]>([]);
  const [pptAllFiles, setPptAllFiles] = useState<Record<string, Uint8Array>>({});
  const [pptActive, setPptActive] = useState(0);
  const [pptError, setPptError] = useState('');
  const [pptEditing, setPptEditing] = useState(false);
  const [pptDisclaimer, setPptDisclaimer] = useState(false);

  // ── Save state ───────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const { add: addFeedback } = useFeedbackStore();

  // ── File type flags ──────────────────────────────────────────────
  const isImage  = ['.jpg','.jpeg','.png','.gif','.svg','.webp','.bmp','.ico'].includes(ext);
  const isText   = ['.txt','.md','.log','.env','.gitignore','.editorconfig'].includes(ext);
  const isCode   = ['.ts','.tsx','.js','.jsx','.py','.go','.rs','.java','.c','.cpp','.h','.css','.html','.json','.yaml','.yml','.toml','.xml','.sh','.bat','.ps1','.sql'].includes(ext);
  const isPdf    = ext === '.pdf';
  const isVideo  = ['.mp4','.webm','.mov','.avi','.mkv','.m4v'].includes(ext);
  const isAudio  = ['.mp3','.ogg','.wav','.flac','.aac','.m4a'].includes(ext);
  const isZip    = ['.zip','.jar'].includes(ext);
  const isDocx   = ['.docx','.doc','.odt','.rtf'].includes(ext);
  const isXlsx   = ['.xlsx','.xls','.csv'].includes(ext);
  const isPptx   = ['.pptx','.ppt'].includes(ext);

  // ── Fetch file data ──────────────────────────────────────────────
  useEffect(() => {
    if (!serverId || !path) return;
    setLoading(true); setError('');
    setVideoReady(false); setZipEntries(null); setZipError('');
    setDocHtml(null); setDocError(''); setDocEditing(false);
    setXlSheets([]); setXlError(''); setXlEditing(false);
    setPptSlides([]); setPptError(''); setPptEditing(false);

    fetch(`/api/files?${new URLSearchParams({ serverId, path, action: 'read' })}`)
      .then((r) => r.json())
      .then((j) => { if (!j.success) throw new Error(j.error); setData(j.data); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));

    return () => { if (videoBlobUrl.current) { URL.revokeObjectURL(videoBlobUrl.current); videoBlobUrl.current = null; } };
  }, [serverId, path]);

  // ── Video blob ───────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !isVideo) return;
    if (videoBlobUrl.current) URL.revokeObjectURL(videoBlobUrl.current);
    const blob = new Blob([b64ToUint8(data.content).buffer as ArrayBuffer], { type: data.mimeType });
    videoBlobUrl.current = URL.createObjectURL(blob);
    setVideoReady(true);
  }, [data, isVideo]);

  // ── ZIP parse ────────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !isZip) return;
    parseZipEntries(data.content).then(setZipEntries).catch((e) => setZipError((e as Error).message));
  }, [data, isZip]);

  // ── DOCX parse ───────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !isDocx) return;
    (async () => {
      try {
        const { default: mammoth } = await import('mammoth');
        const buf = b64ToBuffer(data.content);
        const [htmlRes, txtRes] = await Promise.all([
          mammoth.convertToHtml({ arrayBuffer: buf }),
          mammoth.extractRawText({ arrayBuffer: buf }),
        ]);
        setDocHtml(htmlRes.value);
        setDocRawText(txtRes.value);
        setDocEditText(txtRes.value);
      } catch (e) { setDocError((e as Error).message); }
    })();
  }, [data, isDocx]);

  // ── Excel parse ──────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !isXlsx) return;
    (async () => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(b64ToUint8(data.content), { type: 'array' });
        const parsed: XlsxSheet[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
          const allRows = raw.map((row) => row.map(String));
          return { name, headers: allRows[0] ?? [], rows: allRows.slice(1) };
        });
        setXlSheets(parsed);
        setXlEditSheets(parsed.map((s) => ({ ...s, headers: [...s.headers], rows: s.rows.map((r) => [...r]) })));
      } catch (e) { setXlError((e as Error).message); }
    })();
  }, [data, isXlsx]);

  // ── PPTX parse ───────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !isPptx) return;
    (async () => {
      try {
        const { slides, allFiles } = await parsePptSlides(data.content);
        setPptSlides(slides);
        setPptEditSlides(slides.map((s) => ({ ...s, editRuns: [...s.runs] })));
        setPptAllFiles(allFiles);
      } catch (e) { setPptError((e as Error).message); }
    })();
  }, [data, isPptx]);

  // ── Download helper ──────────────────────────────────────────────
  const downloadFile = useCallback((fd: FileData) => {
    const u8 = b64ToUint8(fd.content);
    const blob = new Blob([u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer], { type: fd.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }, [fileName]);

  // ── Save helpers ─────────────────────────────────────────────────

  const doSave = useCallback(async (b64: string) => {
    setSaving(true);
    try {
      await saveFile(serverId, path, b64);
      addFeedback({ type: 'success', title: 'Document saved', message: \`Successfully saved \${fileName}\` });
    } catch (e) {
      addFeedback({ type: 'error', title: 'Failed to save', message: (e as Error).message });
    }
    finally { setSaving(false); }
  }, [serverId, path, fileName, addFeedback]);

  // ── DOCX save ────────────────────────────────────────────────────
  const saveDocx = useCallback(async () => {
    const bytes = new TextEncoder().encode(docEditText);
    await doSave(uint8ToB64(bytes));
    setDocEditing(false);
  }, [docEditText, doSave]);

  // ── Excel save ───────────────────────────────────────────────────
  const saveExcel = useCallback(async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const sheet of xlEditSheets) {
      const aoa = [sheet.headers, ...sheet.rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }
    // XLSX.write with type:'array' returns a plain number[], not Uint8Array
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as number[];
    await doSave(uint8ToB64(new Uint8Array(out)));
    setXlEditing(false);
  }, [xlEditSheets, doSave]);

  // ── PPTX save ────────────────────────────────────────────────────
  const savePpt = useCallback(async () => {
    const bytes = await savePptx(pptAllFiles, pptEditSlides);
    await doSave(uint8ToB64(bytes));
    setPptEditing(false);
  }, [pptAllFiles, pptEditSlides, doSave]);

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────

  const renderContent = () => {
    if (!data) return null;

    // ── Image ───────────────────────────────────────────────────────
    if (isImage) return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)', background: 'var(--surface-bg)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
        <img src={`data:${data.mimeType};base64,${data.content}`} alt={fileName} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
      </div>
    );

    // ── Text / Code ─────────────────────────────────────────────────
    if (isText || isCode) return (
      <pre style={{ background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', overflow: 'auto', maxHeight: '70vh', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-primary)' }}>
        {atob(data.content)}
      </pre>
    );

    // ── PDF ─────────────────────────────────────────────────────────
    if (isPdf) return (
      <iframe src={`data:application/pdf;base64,${data.content}`} style={{ width: '100%', height: '75vh', border: 'none', borderRadius: 'var(--radius-lg)' }} title={fileName} />
    );

    // ── Video ───────────────────────────────────────────────────────
    if (isVideo) {
      if (!videoReady || !videoBlobUrl.current) return <div className="skeleton" style={{ height: 400, borderRadius: 'var(--radius-xl)' }} />;
      return (
        <div style={{ background: '#000', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
          <video controls src={videoBlobUrl.current} style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block' }} />
        </div>
      );
    }

    // ── Audio ───────────────────────────────────────────────────────
    if (isAudio) {
      const src = URL.createObjectURL(new Blob([b64ToUint8(data.content).buffer.slice(0) as ArrayBuffer], { type: data.mimeType }));
      return (
        <div style={{ background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-brand-400)' }}>
            <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <audio controls src={src} style={{ width: '100%', maxWidth: 480 }} />
        </div>
      );
    }

    // ── ZIP / JAR ───────────────────────────────────────────────────
    if (isZip) {
      if (zipError) return <div className="auth-error">{zipError}</div>;
      if (!zipEntries) return <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />;
      const filtered = zipSearch ? zipEntries.filter((e) => e.name.toLowerCase().includes(zipSearch.toLowerCase())) : zipEntries;
      const fc = zipEntries.filter((e) => !e.isDir).length, dc = zipEntries.filter((e) => e.isDir).length;
      return (
        <div style={{ background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{fc} file{fc !== 1 ? 's' : ''}{dc > 0 ? `, ${dc} folder${dc !== 1 ? 's' : ''}` : ''}</span>
            <input type="search" placeholder="Search…" value={zipSearch} onChange={(e) => setZipSearch(e.target.value)}
              style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', width: 200, outline: 'none' }} />
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {filtered.map((entry, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-5)', borderBottom: i < filtered.length - 1 ? '1px solid var(--surface-border)' : 'none' }}>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: entry.isDir ? 'var(--color-brand-400)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                {!entry.isDir && <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{formatBytes(entry.size)}</span>}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── DOCX / DOC / ODT / RTF ──────────────────────────────────────
    if (isDocx) {
      if (docError) return <div className="auth-error">{docError}</div>;
      if (!docHtml) return <div className="skeleton" style={{ height: 400, borderRadius: 'var(--radius-xl)' }} />;

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {docDisclaimer && (
            <DisclaimerModal
              fileName={fileName}
              bullets={[
                'Overwrite the original file on the remote machine.',
                'Save as plain text — all Word formatting, images, tables, and styles will be permanently lost.',
                'Make the file unreadable by Microsoft Word after saving.',
              ]}
              onConfirm={() => { setDocDisclaimer(false); setDocEditing(true); }}
              onCancel={() => setDocDisclaimer(false)}
            />
          )}

          {docEditing ? (
            <>
              <EditorToolbar label="— plain text, formatting will be lost on save" saving={saving} saved={saved} saveError={saveError}
                onSave={saveDocx} onCancel={() => { setDocEditing(false); setDocEditText(docRawText); clearSaveState(); }} />
              <textarea value={docEditText} onChange={(e) => setDocEditText(e.target.value)}
                style={{ width: '100%', minHeight: 480, padding: 'var(--space-4)', background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)', resize: 'vertical', outline: 'none' }} />
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--radius-lg)' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>📄 Rendered preview — layout may differ from the original document</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setDocDisclaimer(true)}>✏️ Edit as Text</button>
              </div>
              <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'clamp(1.5rem, 5vw, 3rem)', maxHeight: '70vh', overflowY: 'auto' }}>
                <div style={{ maxWidth: 760, margin: '0 auto', color: '#1a1a1a', fontSize: 14, lineHeight: 1.7, fontFamily: 'Georgia, serif' }}
                  dangerouslySetInnerHTML={{ __html: docHtml }} />
              </div>
            </>
          )}
        </div>
      );
    }

    // ── Excel / XLSX / XLS / CSV ────────────────────────────────────
    if (isXlsx) {
      if (xlError) return <div className="auth-error">{xlError}</div>;
      if (!xlSheets.length) return <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />;

      const updateCell = (ri: number, ci: number, val: string) => {
        setXlEditSheets((prev) => {
          const next = prev.map((s) => ({ ...s, rows: s.rows.map((r) => [...r]) }));
          const row = next[xlActiveSheet].rows[ri];
          while (row.length <= ci) row.push('');
          row[ci] = val;
          return next;
        });
      };
      const updateHeader = (ci: number, val: string) => {
        setXlEditSheets((prev) => {
          const next = prev.map((s) => ({ ...s, headers: [...s.headers] }));
          while (next[xlActiveSheet].headers.length <= ci) next[xlActiveSheet].headers.push('');
          next[xlActiveSheet].headers[ci] = val;
          return next;
        });
      };

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {xlDisclaimer && (
            <DisclaimerModal
              fileName={fileName}
              bullets={[
                'Overwrite the original Excel file on the remote machine with your edits.',
                'Formulas will be replaced by their last computed values (formula support is not available in browser editing).',
                'Charts, macros, and complex formatting may not be preserved.',
              ]}
              onConfirm={() => { setXlDisclaimer(false); setXlEditing(true); setXlEditSheets(xlSheets.map((s) => ({ ...s, headers: [...s.headers], rows: s.rows.map((r) => [...r]) }))); }}
              onCancel={() => setXlDisclaimer(false)}
            />
          )}
          <SpreadsheetViewer
            sheets={xlSheets}
            editSheets={xlEditSheets}
            activeSheet={xlActiveSheet}
            onActiveSheetChange={setXlActiveSheet}
            editing={xlEditing}
            onCellChange={updateCell}
            onHeaderChange={updateHeader}
            saving={saving}
            saved={saved}
            saveError={saveError}
            onSave={xlEditing ? saveExcel : () => setXlDisclaimer(true)}
            onCancelEdit={() => { setXlEditing(false); clearSaveState(); }}
          />
        </div>
      );
    }

    // ── PPTX / PPT ──────────────────────────────────────────────────
    if (isPptx) {
      if (pptError) return <div className="auth-error">{pptError}</div>;
      if (!pptSlides.length) return <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />;

      const slides = pptEditing ? pptEditSlides : pptSlides;
      const slide = slides[pptActive];

      const updatePptRun = (slideIdx: number, runIdx: number, val: string) => {
        setPptEditSlides((prev) =>
          prev.map((s, si) => si !== slideIdx ? s : { ...s, editRuns: s.editRuns.map((r, ri) => ri === runIdx ? val : r) })
        );
      };

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {pptDisclaimer && (
            <DisclaimerModal
              fileName={fileName}
              bullets={[
                'Overwrite the original PowerPoint file on the remote machine.',
                'Modify text content only — images, shapes, animations, and slide layout are preserved.',
                'If you change the number of text elements, extra elements will be left empty.',
              ]}
              onConfirm={() => { setPptDisclaimer(false); setPptEditing(true); setPptEditSlides(pptSlides.map((s) => ({ ...s, editRuns: [...s.runs] }))); }}
              onCancel={() => setPptDisclaimer(false)}
            />
          )}

          {pptEditing ? (
            <EditorToolbar label="— text edits only, layout/images preserved" saving={saving} saved={saved} saveError={saveError}
              onSave={savePpt} onCancel={() => { setPptEditing(false); clearSaveState(); }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--radius-lg)' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>📑 {pptSlides.length} slide{pptSlides.length !== 1 ? 's' : ''} — text content only</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setPptDisclaimer(true)}>✏️ Edit Slides</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-4)', minHeight: 400, flexWrap: 'wrap' }}>
            {/* Slide list */}
            <div style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', overflowY: 'auto', maxHeight: '65vh' }}>
              {slides.map((s, i) => (
                <button key={i} onClick={() => setPptActive(i)}
                  style={{ padding: 'var(--space-3)', background: pptActive === i ? 'var(--interactive-brand-bg)' : 'var(--surface-card)', border: `1px solid ${pptActive === i ? 'rgba(99,102,241,0.35)' : 'var(--surface-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>Slide {s.index}</div>
                  <div style={{ fontSize: 11, color: pptActive === i ? 'var(--color-brand-300)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(pptEditing ? s.editRuns : s.runs)[0] || '(empty)'}
                  </div>
                </button>
              ))}
            </div>

            {/* Slide content / editor */}
            <div style={{ flex: 1, background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', overflowY: 'auto', maxHeight: '65vh', minWidth: 200 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)' }}>Slide {slide.index} of {slides.length}{pptEditing ? ' — editing text runs' : ''}</div>
              {(pptEditing ? slide.editRuns : slide.runs).length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>This slide has no text content.</div>
              ) : pptEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {slide.editRuns.map((run, ri) => (
                    <div key={ri}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>Run {ri + 1}</div>
                      <input value={run} onChange={(e) => updatePptRun(pptActive, ri, e.target.value)}
                        style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', background: 'var(--surface-card)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: ri === 0 ? 'var(--text-base)' : 'var(--text-sm)', fontWeight: ri === 0 ? 'var(--font-semibold)' : 'var(--font-normal)', outline: 'none' }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--surface-border)')} />
                    </div>
                  ))}
                </div>
              ) : (
                slide.runs.map((text, i) => (
                  <div key={i} style={{ marginBottom: 'var(--space-3)', fontSize: i === 0 ? 'var(--text-xl)' : 'var(--text-sm)', fontWeight: i === 0 ? 'var(--font-semibold)' : 'var(--font-normal)', color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
                    {text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── Fallback ─────────────────────────────────────────────────────
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M14 3H6C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V8L14 3Z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="empty-state-title">Preview not available</div>
        <div className="empty-state-text">This file type ({ext || 'unknown'}) cannot be previewed in the browser.</div>
        <button className="btn btn-primary" onClick={() => downloadFile(data)}>Download File</button>
      </div>
    );
  };

  const parentPath = path.split(/[/\\]/).slice(0, -1).join(path.includes('\\') ? '\\' : '/');

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <Link href={`/dashboard/files?serverId=${serverId}&path=${encodeURIComponent(parentPath)}`}
            style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-1)', display: 'block' }}>
            ← Back to files
          </Link>
          <h1 className="page-title" style={{ fontSize: 'var(--text-xl)' }}>{fileName}</h1>
          {data && <p className="page-subtitle">{data.mimeType} · {formatBytes(data.size)}</p>}
        </div>
        <div className="page-header-right">
          {data && <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(data)}>Download</button>}
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 400, borderRadius: 'var(--radius-xl)' }} />
      ) : error ? (
        <div className="auth-error">{error}</div>
      ) : (
        renderContent()
      )}
    </>
  );
}
