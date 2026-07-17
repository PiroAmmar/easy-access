'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './spreadsheet.module.css';
import type { SpreadsheetState, SpreadsheetAction } from './useSpreadsheetState';
import type { SpreadsheetEngine } from './engine';
import type { CellStyle, MergeRange } from './types';
import { normalizeRange, toA1 } from './coords';
import { rangeToCsv, parseTsv } from './clipboard';
import { RibbonButton, RibbonDropdown, SplitButton, ColorPicker } from './RibbonControls';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RibbonProps {
  state: SpreadsheetState;
  dispatch: React.Dispatch<SpreadsheetAction>;
  editing: boolean;
  engine: SpreadsheetEngine | null;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onFindReplace: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSelectionPatches(state: SpreadsheetState): { r: number; c: number }[] {
  const { anchor, focus } = state.selection;
  const nr = normalizeRange({ r1: anchor.r, c1: anchor.c, r2: focus.r, c2: focus.c });
  const patches: { r: number; c: number }[] = [];
  for (let r = nr.r1; r <= nr.r2; r++) {
    for (let c = nr.c1; c <= nr.c2; c++) {
      patches.push({ r, c });
    }
  }
  return patches;
}

function getFocusCell(state: SpreadsheetState) {
  const { r, c } = state.selection.focus;
  const sheet = state.model.sheets[state.activeSheet];
  return sheet?.cells[r]?.[c] ?? null;
}

function adjustDecimals(fmt: string, delta: number): string {
  if (!fmt || fmt === 'General' || fmt === '@') {
    return delta > 0 ? '0.0' : '0';
  }
  // Find decimal point in format and add/remove a zero
  const dotIdx = fmt.indexOf('.');
  if (dotIdx === -1) {
    return delta > 0 ? fmt + '.0' : fmt;
  }
  // Count zeros after dot
  let zeros = 0;
  for (let i = dotIdx + 1; i < fmt.length; i++) {
    if (fmt[i] === '0') zeros++;
    else break;
  }
  if (delta > 0) {
    return fmt.slice(0, dotIdx + 1) + '0'.repeat(zeros + 1) + fmt.slice(dotIdx + 1 + zeros);
  } else {
    if (zeros <= 0) return fmt;
    const newZeros = zeros - 1;
    if (newZeros === 0) {
      // Remove the dot too
      return fmt.slice(0, dotIdx) + fmt.slice(dotIdx + 1 + zeros);
    }
    return fmt.slice(0, dotIdx + 1) + '0'.repeat(newZeros) + fmt.slice(dotIdx + 1 + zeros);
  }
}

// ─── InsertDeletePanel ────────────────────────────────────────────────────────

type PanelKind = 'insertRows' | 'deleteRows' | 'insertCols' | 'deleteCols';

interface InsertDeletePanelProps {
  kind: PanelKind;
  defaultCount: number;
  defaultStart: number;   // 1-based row or col index from selection
  onConfirm: (count: number, direction: string, start: number) => void;
  onClose: () => void;
}

function InsertDeletePanel({ kind, defaultCount, defaultStart, onConfirm, onClose }: InsertDeletePanelProps) {
  const [count, setCount] = useState(defaultCount);
  const [direction, setDirection] = useState(
    kind === 'insertRows' ? 'above' : kind === 'insertCols' ? 'left' : ''
  );
  const [start, setStart] = useState(defaultStart);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isInsert = kind === 'insertRows' || kind === 'insertCols';
  const isRow = kind === 'insertRows' || kind === 'deleteRows';
  const unitLabel = isRow ? 'row' : 'column';

  const title = kind === 'insertRows' ? 'Insert Rows'
    : kind === 'deleteRows' ? 'Delete Rows'
    : kind === 'insertCols' ? 'Insert Columns'
    : 'Delete Columns';

  return (
    <div ref={panelRef} className={styles.insertDeletePanel}>
      <div style={{ fontWeight: 700, fontSize: 12, borderBottom: '1px solid #e8e8e8', paddingBottom: 6, marginBottom: 2 }}>
        {title}
      </div>

      {/* Starting row/col */}
      <label>
        {isRow ? `Starting ${unitLabel} (1-based)` : `Starting ${unitLabel} (1-based)`}
        <input
          type="number"
          min={1}
          value={start}
          onChange={e => setStart(Math.max(1, parseInt(e.target.value) || 1))}
          autoFocus={!isInsert}
        />
      </label>

      {/* Count */}
      <label>
        Number of {unitLabel}s (default 1)
        <input
          type="number"
          min={1}
          value={count}
          onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
          autoFocus={isInsert}
        />
      </label>

      {/* Direction (insert only) */}
      {isInsert && (
        <div>
          <div style={{ fontSize: 11, color: '#616161', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 4 }}>
            Position
          </div>
          <div className={styles.insertDeleteRadioGroup}>
            {isRow ? (
              <>
                <label>
                  <input type="radio" name="dir" value="above" checked={direction === 'above'} onChange={() => setDirection('above')} />
                  Above
                </label>
                <label>
                  <input type="radio" name="dir" value="below" checked={direction === 'below'} onChange={() => setDirection('below')} />
                  Below
                </label>
              </>
            ) : (
              <>
                <label>
                  <input type="radio" name="dir" value="left" checked={direction === 'left'} onChange={() => setDirection('left')} />
                  Left
                </label>
                <label>
                  <input type="radio" name="dir" value="right" checked={direction === 'right'} onChange={() => setDirection('right')} />
                  Right
                </label>
              </>
            )}
          </div>
        </div>
      )}

      <div className={styles.insertDeleteActions}>
        <button className={styles.insertDeleteCancel} onClick={onClose}>Cancel</button>
        <button className={styles.insertDeleteOk} onClick={() => { onConfirm(count, direction, start); onClose(); }}>
          OK
        </button>
      </div>
    </div>
  );
}

// ─── RibbonGroup wrapper ──────────────────────────────────────────────────────

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.ribbonGroup}>
      <div className={styles.ribbonGroupControls}>{children}</div>
      <div className={styles.ribbonGroupLabel}>{label}</div>
    </div>
  );
}

// ─── Main Ribbon ──────────────────────────────────────────────────────────────

export default function Ribbon({ state, dispatch, editing, engine, onCopy, onCut, onPaste, onFindReplace }: RibbonProps) {
  const [fillColorOpen, setFillColorOpen] = useState(false);
  const [fontColorOpen, setFontColorOpen] = useState(false);
  const [fillColor, setFillColor] = useState('#ffff00');
  const [fontColor, setFontColor] = useState('#ff0000');
  const [clipboardMsg, setClipboardMsg] = useState('');
  const [openPanel, setOpenPanel] = useState<PanelKind | null>(null);

  const focusCell = getFocusCell(state);
  const focusStyle: CellStyle = focusCell?.s ?? {};
  const sheet = state.model.sheets[state.activeSheet];
  const sel = state.selection;
  const nr = normalizeRange({ r1: sel.anchor.r, c1: sel.anchor.c, r2: sel.focus.r, c2: sel.focus.c });

  function applyStyle(style: Partial<CellStyle>) {
    if (!editing) return;
    dispatch({
      type: 'SET_CELL_STYLE',
      sheet: state.activeSheet,
      patches: getSelectionPatches(state),
      style,
    });
  }

  function applyNumFmt(numFmt: string) {
    if (!editing) return;
    dispatch({
      type: 'SET_NUM_FMT',
      sheet: state.activeSheet,
      patches: getSelectionPatches(state),
      numFmt,
    });
  }

  // ── Clipboard via navigator.clipboard ────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!sheet) return;
    const tsv = rangeToCsv(sheet, nr.r1, nr.c1, nr.r2, nr.c2);
    try {
      await navigator.clipboard.writeText(tsv);
      setClipboardMsg('');
    } catch {
      onCopy();
    }
  }, [sheet, nr, onCopy]);

  const handleCut = useCallback(async () => {
    if (!sheet || !editing) return;
    const tsv = rangeToCsv(sheet, nr.r1, nr.c1, nr.r2, nr.c2);
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      onCut();
      return;
    }
    const cells: { r: number; c: number; cell: null }[] = [];
    for (let r = nr.r1; r <= nr.r2; r++) {
      for (let c = nr.c1; c <= nr.c2; c++) {
        cells.push({ r, c, cell: null });
      }
    }
    dispatch({ type: 'SET_CELLS_BATCH', sheet: state.activeSheet, cells, addUndo: true });
  }, [sheet, editing, nr, dispatch, state.activeSheet, onCut]);

  const handlePaste = useCallback(async () => {
    if (!editing) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const rows = parseTsv(text);
      const { r, c } = sel.focus;
      const cells: { r: number; c: number; cell: { v: string } | null }[] = [];
      for (let ri = 0; ri < rows.length; ri++) {
        for (let ci = 0; ci < (rows[ri]?.length ?? 0); ci++) {
          const val = rows[ri]?.[ci] ?? '';
          cells.push({ r: r + ri, c: c + ci, cell: val === '' ? null : { v: val } });
        }
      }
      dispatch({ type: 'SET_CELLS_BATCH', sheet: state.activeSheet, cells, addUndo: true });
    } catch {
      setClipboardMsg('Use Ctrl+V to paste');
      setTimeout(() => setClipboardMsg(''), 3000);
    }
  }, [editing, sel.focus, dispatch, state.activeSheet]);

  const handlePasteValuesOnly = useCallback(async () => {
    if (!editing) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const rows = parseTsv(text);
      const { r, c } = sel.focus;
      const cells: { r: number; c: number; cell: { v: string } | null }[] = [];
      for (let ri = 0; ri < rows.length; ri++) {
        for (let ci = 0; ci < (rows[ri]?.length ?? 0); ci++) {
          const val = rows[ri]?.[ci] ?? '';
          cells.push({ r: r + ri, c: c + ci, cell: val === '' ? null : { v: val } });
        }
      }
      dispatch({ type: 'SET_CELLS_BATCH', sheet: state.activeSheet, cells, addUndo: true });
    } catch {
      setClipboardMsg('Use Ctrl+V to paste');
      setTimeout(() => setClipboardMsg(''), 3000);
    }
  }, [editing, sel.focus, dispatch, state.activeSheet]);

  // ── Borders ──────────────────────────────────────────────────────────────

  function applyBorder(which: string) {
    const thin = { style: 'thin' as const, color: '#000000' };
    let border: CellStyle['border'] = {};
    switch (which) {
      case 'all':    border = { top: thin, bottom: thin, left: thin, right: thin }; break;
      case 'outline': border = { top: thin, bottom: thin, left: thin, right: thin }; break;
      case 'bottom': border = { bottom: thin }; break;
      case 'top':    border = { top: thin }; break;
      case 'left':   border = { left: thin }; break;
      case 'right':  border = { right: thin }; break;
      case 'none':   border = {}; break;
    }
    applyStyle({ border });
  }

  // ── Merge & Center ───────────────────────────────────────────────────────

  function handleMergeCenter() {
    if (!editing || !sheet) return;
    const isMulti = nr.r1 !== nr.r2 || nr.c1 !== nr.c2;
    if (isMulti) {
      const range: MergeRange = { r1: nr.r1, c1: nr.c1, r2: nr.r2, c2: nr.c2 };
      dispatch({ type: 'MERGE_CELLS', sheet: state.activeSheet, range });
      applyStyle({ hAlign: 'center' });
    } else {
      // Check if focus cell is in a merge
      const existing = sheet.merges.find(m =>
        nr.r1 >= m.r1 && nr.r1 <= m.r2 && nr.c1 >= m.c1 && nr.c1 <= m.c2
      );
      if (existing) {
        dispatch({ type: 'UNMERGE_CELLS', sheet: state.activeSheet, range: existing });
      }
    }
  }

  // ── AutoSum ──────────────────────────────────────────────────────────────

  function handleAutoSum() {
    if (!editing || !engine?.isReady()) return;
    const { r, c } = sel.focus;
    // Find contiguous numeric block above
    let topR = r - 1;
    while (topR >= 0) {
      const cell = sheet?.cells[topR]?.[c] ?? null;
      if (!cell) break;
      const val = cell.f ? engine.getDisplayValue(state.activeSheet, topR, c) : cell.v;
      if (typeof val !== 'number') break;
      topR--;
    }
    topR++;
    if (topR >= r) return; // nothing above
    const startRef = toA1(topR, c);
    const endRef = toA1(r - 1, c);
    dispatch({ type: 'START_EDIT', r, c, initialValue: `=SUM(${startRef}:${endRef})` });
  }

  // ── Number format ────────────────────────────────────────────────────────

  const numFmtOptions = [
    { label: 'General', value: 'General' },
    { label: 'Number', value: '#,##0.00' },
    { label: 'Currency', value: '"$"#,##0.00' },
    { label: 'Percent', value: '0.00%' },
    { label: 'Date', value: 'm/d/yyyy' },
    { label: 'Text', value: '@' },
  ];

  const currentNumFmt = focusStyle.numFmt ?? 'General';
  const currentNumFmtLabel = numFmtOptions.find(o => o.value === currentNumFmt)?.label ?? currentNumFmt;

  // ── Font ─────────────────────────────────────────────────────────────────

  const fontFamilies = ['Calibri', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'];
  const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

  return (
    <div className={styles.ribbon} role="toolbar" aria-label="Home ribbon">
      {clipboardMsg && (
        <div style={{ position: 'absolute', top: 64, left: 8, background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 3, padding: '3px 8px', fontSize: 11, zIndex: 100 }}>
          {clipboardMsg}
        </div>
      )}

      {/* ── Clipboard ── */}
      <Group label="Clipboard">
        <SplitButton
          onClick={handlePaste}
          dropdownItems={[{ label: 'Paste Values Only', value: 'values' }]}
          onSelect={() => handlePasteValuesOnly()}
          disabled={!editing}
          title="Paste (Ctrl+V)"
        >
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontSize: 9 }}>Paste</span>
        </SplitButton>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <RibbonButton onClick={handleCut} disabled={!editing} title="Cut (Ctrl+X)">
            ✂ <span style={{ fontSize: 9 }}>Cut</span>
          </RibbonButton>
          <RibbonButton onClick={handleCopy} title="Copy (Ctrl+C)">
            📄 <span style={{ fontSize: 9 }}>Copy</span>
          </RibbonButton>
        </div>
      </Group>

      {/* ── Font ── */}
      <Group label="Font">
        <RibbonDropdown
          items={fontFamilies.map(f => ({ label: f, value: f }))}
          onSelect={(v) => applyStyle({ fontFamily: v })}
          selectedValue={focusStyle.fontFamily ?? 'Calibri'}
          disabled={!editing}
          minWidth={80}
          label={focusStyle.fontFamily ?? 'Calibri'}
        />
        <RibbonDropdown
          items={fontSizes.map(s => ({ label: String(s), value: String(s) }))}
          onSelect={(v) => applyStyle({ fontSize: Number(v) })}
          selectedValue={String(focusStyle.fontSize ?? 11)}
          disabled={!editing}
          minWidth={44}
          label={String(focusStyle.fontSize ?? 11)}
        />
        <RibbonButton
          onClick={() => applyStyle({ bold: !focusStyle.bold })}
          active={!!focusStyle.bold}
          disabled={!editing}
          title="Bold (Ctrl+B)"
        >
          <span style={{ fontWeight: 700, fontSize: 13 }}>B</span>
        </RibbonButton>
        <RibbonButton
          onClick={() => applyStyle({ italic: !focusStyle.italic })}
          active={!!focusStyle.italic}
          disabled={!editing}
          title="Italic (Ctrl+I)"
        >
          <span style={{ fontStyle: 'italic', fontSize: 13 }}>I</span>
        </RibbonButton>
        <RibbonButton
          onClick={() => applyStyle({ underline: !focusStyle.underline })}
          active={!!focusStyle.underline}
          disabled={!editing}
          title="Underline (Ctrl+U)"
        >
          <span style={{ textDecoration: 'underline', fontSize: 13 }}>U</span>
        </RibbonButton>
        <RibbonDropdown
          label={<span style={{ fontSize: 11 }}>⊞ Borders</span>}
          items={[
            { label: 'All Borders', value: 'all' },
            { label: 'Outline', value: 'outline' },
            { label: 'Bottom', value: 'bottom' },
            { label: 'Top', value: 'top' },
            { label: 'Left', value: 'left' },
            { label: 'Right', value: 'right' },
            { label: 'No Border', value: 'none' },
          ]}
          onSelect={(v) => applyBorder(v)}
          disabled={!editing}
          minWidth={100}
        />
        {/* Fill Color */}
        <div style={{ position: 'relative' }}>
          <RibbonButton
            onClick={() => { setFillColorOpen(o => !o); setFontColorOpen(false); }}
            disabled={!editing}
            title="Fill Color"
          >
            <span style={{ fontSize: 12 }}>🪣</span>
            <div style={{ width: 16, height: 3, background: fillColor, borderRadius: 1, border: '1px solid rgba(0,0,0,0.2)' }} />
          </RibbonButton>
          {fillColorOpen && (
            <ColorPicker
              onSelect={(color) => { setFillColor(color); applyStyle({ fill: color }); }}
              onClose={() => setFillColorOpen(false)}
            />
          )}
        </div>
        {/* Font Color */}
        <div style={{ position: 'relative' }}>
          <RibbonButton
            onClick={() => { setFontColorOpen(o => !o); setFillColorOpen(false); }}
            disabled={!editing}
            title="Font Color"
          >
            <span style={{ fontSize: 12, color: fontColor, fontWeight: 700, textDecoration: `underline ${fontColor}` }}>A</span>
            <div style={{ width: 16, height: 3, background: fontColor, borderRadius: 1, border: '1px solid rgba(0,0,0,0.2)' }} />
          </RibbonButton>
          {fontColorOpen && (
            <ColorPicker
              onSelect={(color) => { setFontColor(color); applyStyle({ fontColor: color }); }}
              onClose={() => setFontColorOpen(false)}
            />
          )}
        </div>
      </Group>

      {/* ── Alignment ── */}
      <Group label="Alignment">
        <RibbonButton onClick={() => applyStyle({ hAlign: 'left' })} active={focusStyle.hAlign === 'left'} disabled={!editing} title="Align Left">
          <span style={{ fontSize: 12 }}>≡</span>
        </RibbonButton>
        <RibbonButton onClick={() => applyStyle({ hAlign: 'center' })} active={focusStyle.hAlign === 'center'} disabled={!editing} title="Center">
          <span style={{ fontSize: 12 }}>☰</span>
        </RibbonButton>
        <RibbonButton onClick={() => applyStyle({ hAlign: 'right' })} active={focusStyle.hAlign === 'right'} disabled={!editing} title="Align Right">
          <span style={{ fontSize: 12, direction: 'rtl' }}>≡</span>
        </RibbonButton>
        <div style={{ width: 1, background: '#d1d1d1', margin: '2px 2px', alignSelf: 'stretch' }} />
        <RibbonButton onClick={() => applyStyle({ vAlign: 'top' })} active={focusStyle.vAlign === 'top'} disabled={!editing} title="Align Top">
          <span style={{ fontSize: 10 }}>⊤</span>
        </RibbonButton>
        <RibbonButton onClick={() => applyStyle({ vAlign: 'middle' })} active={focusStyle.vAlign === 'middle'} disabled={!editing} title="Middle">
          <span style={{ fontSize: 10 }}>⊟</span>
        </RibbonButton>
        <RibbonButton onClick={() => applyStyle({ vAlign: 'bottom' })} active={focusStyle.vAlign === 'bottom'} disabled={!editing} title="Align Bottom">
          <span style={{ fontSize: 10 }}>⊥</span>
        </RibbonButton>
        <div style={{ width: 1, background: '#d1d1d1', margin: '2px 2px', alignSelf: 'stretch' }} />
        <RibbonButton onClick={() => applyStyle({ wrap: !focusStyle.wrap })} active={!!focusStyle.wrap} disabled={!editing} title="Wrap Text">
          <span style={{ fontSize: 9 }}>Wrap</span>
        </RibbonButton>
        <RibbonButton onClick={handleMergeCenter} disabled={!editing} title="Merge & Center">
          <span style={{ fontSize: 9 }}>M&amp;C</span>
        </RibbonButton>
      </Group>

      {/* ── Number ── */}
      <Group label="Number">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <RibbonDropdown
            label={currentNumFmtLabel}
            items={numFmtOptions}
            onSelect={(v) => applyNumFmt(v)}
            disabled={!editing}
            minWidth={90}
          />
          <div style={{ display: 'flex', gap: 2 }}>
            <RibbonButton onClick={() => applyNumFmt('"$"#,##0.00')} disabled={!editing} title="Currency">$</RibbonButton>
            <RibbonButton onClick={() => applyNumFmt('0.00%')} disabled={!editing} title="Percent">%</RibbonButton>
            <RibbonButton onClick={() => applyNumFmt('#,##0.00')} disabled={!editing} title="Comma">,</RibbonButton>
            <RibbonButton
              onClick={() => applyNumFmt(adjustDecimals(currentNumFmt, 1))}
              disabled={!editing}
              title="Increase Decimal"
            >
              <span style={{ fontSize: 9 }}>▲.0</span>
            </RibbonButton>
            <RibbonButton
              onClick={() => applyNumFmt(adjustDecimals(currentNumFmt, -1))}
              disabled={!editing}
              title="Decrease Decimal"
            >
              <span style={{ fontSize: 9 }}>▼.0</span>
            </RibbonButton>
          </div>
        </div>
      </Group>

      {/* ── Cells ── */}
      <Group label="Cells">
        {/* Insert Rows */}
        <div style={{ position: 'relative' }}>
          <RibbonButton
            onClick={() => { if (!editing) return; setOpenPanel(p => p === 'insertRows' ? null : 'insertRows'); }}
            disabled={!editing}
            title="Insert Rows"
          >
            <span style={{ fontSize: 10 }}>⊕ Rows</span>
          </RibbonButton>
          {openPanel === 'insertRows' && (
            <InsertDeletePanel
              kind="insertRows"
              defaultCount={1}
              defaultStart={nr.r1 + 1}
              onConfirm={(count, direction, start) => {
                const rowIndex = direction === 'below' ? start : start - 1;
                dispatch({ type: 'INSERT_ROWS', sheet: state.activeSheet, rowIndex, count });
              }}
              onClose={() => setOpenPanel(null)}
            />
          )}
        </div>

        {/* Insert Cols */}
        <div style={{ position: 'relative' }}>
          <RibbonButton
            onClick={() => { if (!editing) return; setOpenPanel(p => p === 'insertCols' ? null : 'insertCols'); }}
            disabled={!editing}
            title="Insert Columns"
          >
            <span style={{ fontSize: 10 }}>⊕ Cols</span>
          </RibbonButton>
          {openPanel === 'insertCols' && (
            <InsertDeletePanel
              kind="insertCols"
              defaultCount={1}
              defaultStart={nr.c1 + 1}
              onConfirm={(count, direction, start) => {
                const colIndex = direction === 'right' ? start : start - 1;
                dispatch({ type: 'INSERT_COLS', sheet: state.activeSheet, colIndex, count });
              }}
              onClose={() => setOpenPanel(null)}
            />
          )}
        </div>

        {/* Delete Rows */}
        <div style={{ position: 'relative' }}>
          <RibbonButton
            onClick={() => { if (!editing) return; setOpenPanel(p => p === 'deleteRows' ? null : 'deleteRows'); }}
            disabled={!editing}
            title="Delete Rows"
          >
            <span style={{ fontSize: 10 }}>⊖ Rows</span>
          </RibbonButton>
          {openPanel === 'deleteRows' && (
            <InsertDeletePanel
              kind="deleteRows"
              defaultCount={nr.r2 - nr.r1 + 1}
              defaultStart={nr.r1 + 1}
              onConfirm={(count, _dir, start) => {
                dispatch({ type: 'DELETE_ROWS', sheet: state.activeSheet, rowIndex: start - 1, count });
              }}
              onClose={() => setOpenPanel(null)}
            />
          )}
        </div>

        {/* Delete Cols */}
        <div style={{ position: 'relative' }}>
          <RibbonButton
            onClick={() => { if (!editing) return; setOpenPanel(p => p === 'deleteCols' ? null : 'deleteCols'); }}
            disabled={!editing}
            title="Delete Columns"
          >
            <span style={{ fontSize: 10 }}>⊖ Cols</span>
          </RibbonButton>
          {openPanel === 'deleteCols' && (
            <InsertDeletePanel
              kind="deleteCols"
              defaultCount={nr.c2 - nr.c1 + 1}
              defaultStart={nr.c1 + 1}
              onConfirm={(count, _dir, start) => {
                dispatch({ type: 'DELETE_COLS', sheet: state.activeSheet, colIndex: start - 1, count });
              }}
              onClose={() => setOpenPanel(null)}
            />
          )}
        </div>
      </Group>

      {/* ── Editing ── */}
      <Group label="Editing">
        <RibbonButton onClick={handleAutoSum} disabled={!editing} title="AutoSum">
          <span style={{ fontSize: 14 }}>Σ</span>
        </RibbonButton>
        <RibbonDropdown
          label={<span style={{ fontSize: 11 }}>Clear</span>}
          items={[
            { label: 'Clear All', value: 'all' },
            { label: 'Clear Contents', value: 'contents' },
            { label: 'Clear Formats', value: 'formats' },
          ]}
          onSelect={(v) => {
            if (!editing) return;
            dispatch({
              type: 'CLEAR_RANGE',
              sheet: state.activeSheet,
              r1: nr.r1, c1: nr.c1, r2: nr.r2, c2: nr.c2,
              what: v as 'all' | 'contents' | 'formats',
            });
          }}
          disabled={!editing}
          minWidth={100}
        />
        <RibbonButton
          onClick={() => {
            if (!editing) return;
            dispatch({ type: 'SORT_ROWS', sheet: state.activeSheet, colIndex: sel.focus.c, ascending: true });
          }}
          disabled={!editing}
          title="Sort A to Z"
        >
          <span style={{ fontSize: 9 }}>A→Z</span>
        </RibbonButton>
        <RibbonButton
          onClick={() => {
            if (!editing) return;
            dispatch({ type: 'SORT_ROWS', sheet: state.activeSheet, colIndex: sel.focus.c, ascending: false });
          }}
          disabled={!editing}
          title="Sort Z to A"
        >
          <span style={{ fontSize: 9 }}>Z→A</span>
        </RibbonButton>
        <RibbonButton onClick={onFindReplace} title="Find & Replace" disabled={false}>
          <span style={{ fontSize: 11 }}>🔍</span>
        </RibbonButton>
      </Group>
    </div>
  );
}
