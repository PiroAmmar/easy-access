'use client';

import React, { useRef, useEffect, useCallback, memo } from 'react';
import styles from './spreadsheet.module.css';
import type { SpreadsheetState, SpreadsheetAction } from './useSpreadsheetState';
import type { Cell, MergeRange, Selection } from './types';
import { colLetter, buildCoveredSet, normalizeRange } from './coords';
import { formatCell } from './formatting';
import type { SpreadsheetEngine } from './engine';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ROWS = 500;
const DEFAULT_COL_W = 64;
const DEFAULT_ROW_H = 24;
const ROW_HEADER_W = 44;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCellInRange(r: number, c: number, sel: Selection): boolean {
  const nr = normalizeRange({ r1: sel.anchor.r, c1: sel.anchor.c, r2: sel.focus.r, c2: sel.focus.c });
  return r >= nr.r1 && r <= nr.r2 && c >= nr.c1 && c <= nr.c2;
}

function isRangeMultiCell(sel: Selection): boolean {
  return sel.anchor.r !== sel.focus.r || sel.anchor.c !== sel.focus.c;
}

function isRowSelected(ri: number, sel: Selection): boolean {
  const nr = normalizeRange({ r1: sel.anchor.r, c1: sel.anchor.c, r2: sel.focus.r, c2: sel.focus.c });
  return ri >= nr.r1 && ri <= nr.r2;
}

function isColSelected(ci: number, sel: Selection): boolean {
  const nr = normalizeRange({ r1: sel.anchor.r, c1: sel.anchor.c, r2: sel.focus.r, c2: sel.focus.c });
  return ci >= nr.c1 && ci <= nr.c2;
}

function getMergeForCell(r: number, c: number, merges: MergeRange[]): MergeRange | null {
  for (const m of merges) {
    const nr = normalizeRange(m);
    if (r === nr.r1 && c === nr.c1) return m;
  }
  return null;
}

function getCellStyle(cell: Cell | null): React.CSSProperties {
  if (!cell?.s) return {};
  const s = cell.s;
  const style: React.CSSProperties = {};
  if (s.bold) style.fontWeight = 700;
  if (s.italic) style.fontStyle = 'italic';
  if (s.underline) style.textDecoration = 'underline';
  if (s.fontSize) style.fontSize = `${s.fontSize}pt`;
  if (s.fontFamily) style.fontFamily = s.fontFamily;
  if (s.fontColor) style.color = s.fontColor;
  if (s.fill) style.backgroundColor = s.fill;
  return style;
}

// ─── SheetRow sub-component (memoized) ───────────────────────────────────────

interface SheetRowProps {
  ri: number;
  cells: (Cell | null)[];
  colWidths: number[];
  totalCols: number;
  isRowSelected: boolean;
  selection: Selection;
  editCell: { r: number; c: number; value: string } | null;
  merges: MergeRange[];
  coveredSet: Set<string>;
  editing: boolean;
  dispatch: React.Dispatch<SpreadsheetAction>;
  version: number;
  rowHeight: number;
  sheetIdx: number;
  engine: SpreadsheetEngine | null;
  onMouseDown: (ri: number, ci: number, e: React.MouseEvent) => void;
  onMouseEnter: (ri: number, ci: number) => void;
  onDoubleClick: (ri: number, ci: number) => void;
  onRowHeaderClick: (ri: number) => void;
  onEditInputChange: (value: string) => void;
  onEditInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, ri: number, ci: number) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
}

const SheetRow = memo(function SheetRow({
  ri, cells, colWidths, totalCols, isRowSelected: rowSelected,
  selection, editCell, merges, coveredSet, editing,
  dispatch, rowHeight, sheetIdx, engine,
  onMouseDown, onMouseEnter, onDoubleClick, onRowHeaderClick,
  onEditInputChange, onEditInputKeyDown, editInputRef,
}: SheetRowProps) {
  const isFocusRow = ri === selection.focus.r;

  return (
    <tr style={{ height: rowHeight }}>
      {/* Row header */}
      <td
        className={`${styles.rowHeader} ${rowSelected ? styles.headerSelected : ''}`}
        style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W, height: rowHeight }}
        onClick={() => onRowHeaderClick(ri)}
      >
        {ri + 1}
      </td>

      {/* Data cells */}
      {Array.from({ length: totalCols }, (_, ci) => {
        const key = `${ri},${ci}`;

        // Skip covered cells
        if (coveredSet.has(key)) return null;

        const cell = cells[ci] ?? null;
        const isFocus = isFocusRow && ci === selection.focus.c;
        const inRange = isCellInRange(ri, ci, selection);
        const isMulti = isRangeMultiCell(selection);
        const isEditing = editCell !== null && editCell.r === ri && editCell.c === ci;

        // Merge span
        const merge = getMergeForCell(ri, ci, merges);
        const colSpan = merge ? (merge.c2 - merge.c1 + 1) : 1;
        const rowSpan = merge ? (merge.r2 - merge.r1 + 1) : 1;

        const w = colWidths[ci] ?? DEFAULT_COL_W;

        // For formula cells, use the computed value from the engine
        let computedValue: import('./types').CellValue | undefined;
        if (cell?.f && engine?.isReady()) {
          computedValue = engine.getDisplayValue(sheetIdx, ri, ci);
        }

        const { text, defaultAlign } = formatCell(cell, computedValue);
        const textAlign = cell?.s?.hAlign ?? defaultAlign;
        const cellInlineStyle = getCellStyle(cell);

        // Class composition
        let cellClass = styles.cell;
        if (isFocus && !isEditing) cellClass += ' ' + styles.cellSelected;
        else if (isEditing) cellClass += ' ' + styles.cellEditing;
        if (inRange && isMulti && !isFocus) cellClass += ' ' + styles.cellInRange;

        return (
          <td
            key={ci}
            className={cellClass}
            colSpan={colSpan > 1 ? colSpan : undefined}
            rowSpan={rowSpan > 1 ? rowSpan : undefined}
            style={{
              width: w,
              minWidth: w,
              maxWidth: w,
              height: rowHeight,
              textAlign,
              lineHeight: `${rowHeight}px`,
              ...cellInlineStyle,
            }}
            onMouseDown={(e) => onMouseDown(ri, ci, e)}
            onMouseEnter={() => onMouseEnter(ri, ci)}
            onDoubleClick={() => onDoubleClick(ri, ci)}
          >
            {isEditing ? (
              <input
                ref={editInputRef}
                className={styles.cellEditInput}
                value={editCell!.value}
                onChange={(e) => onEditInputChange(e.target.value)}
                onKeyDown={(e) => onEditInputKeyDown(e, ri, ci)}
                autoFocus
              />
            ) : (
              <span className={styles.truncated} style={{ textAlign, lineHeight: `${rowHeight}px` }}>
                {text}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
});

// ─── Grid component ───────────────────────────────────────────────────────────

interface GridProps {
  state: SpreadsheetState;
  dispatch: React.Dispatch<SpreadsheetAction>;
  editing: boolean;
  engine: SpreadsheetEngine | null;
  commitEdit: (r: number, c: number) => void;
}

export default function Grid({ state, dispatch, editing, engine, commitEdit }: GridProps) {
  const { model, activeSheet, selection, editCell } = state;
  const sheet = model.sheets[activeSheet];
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const isDragging = useRef(false);
  const dragAnchor = useRef<{ r: number; c: number } | null>(null);

  if (!sheet) return null;

  const usedRows = sheet.cells.length;
  const usedCols = sheet.cells.reduce((m, row) => Math.max(m, row?.length ?? 0), 0);
  const totalRows = Math.min(Math.max(usedRows, 1), MAX_ROWS);
  const totalCols = Math.max(usedCols, 26);

  const colWidths = sheet.colWidths;
  const rowHeights = sheet.rowHeights;

  const coveredSet = buildCoveredSet(sheet.merges);

  // Focus grid container when not editing
  useEffect(() => {
    if (!editCell && containerRef.current) {
      containerRef.current.focus({ preventScroll: true });
    }
  }, [editCell]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editCell && editInputRef.current) {
      editInputRef.current.focus();
      // If initial value is a full cell value (not typed key), select all
      if (editInputRef.current.value === editCell.value) {
        editInputRef.current.select();
      }
    }
  }, [editCell?.r, editCell?.c]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mouse up on window to stop dragging
  useEffect(() => {
    const onMouseUp = () => { isDragging.current = false; dragAnchor.current = null; };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  const handleMouseDown = useCallback((ri: number, ci: number, e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragAnchor.current = { r: ri, c: ci };
    dispatch({ type: 'SET_SELECTION', anchor: { r: ri, c: ci }, focus: { r: ri, c: ci } });
    containerRef.current?.focus({ preventScroll: true });
  }, [dispatch]);

  const handleMouseEnter = useCallback((ri: number, ci: number) => {
    if (!isDragging.current || !dragAnchor.current) return;
    dispatch({
      type: 'SET_SELECTION',
      anchor: dragAnchor.current,
      focus: { r: ri, c: ci },
    });
  }, [dispatch]);

  const handleDoubleClick = useCallback((ri: number, ci: number) => {
    if (!editing) return;
    dispatch({ type: 'START_EDIT', r: ri, c: ci });
  }, [editing, dispatch]);

  const handleColHeaderClick = useCallback((ci: number) => {
    dispatch({
      type: 'SET_SELECTION',
      anchor: { r: 0, c: ci },
      focus: { r: totalRows - 1, c: ci },
    });
  }, [dispatch, totalRows]);

  const handleRowHeaderClick = useCallback((ri: number) => {
    dispatch({
      type: 'SET_SELECTION',
      anchor: { r: ri, c: 0 },
      focus: { r: ri, c: totalCols - 1 },
    });
  }, [dispatch, totalCols]);

  const handleEditInputChange = useCallback((value: string) => {
    if (!editCell) return;
    dispatch({ type: 'START_EDIT', r: editCell.r, c: editCell.c, initialValue: value });
  }, [dispatch, editCell]);

  const handleEditInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, ri: number, ci: number) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      commitEdit(ri, ci);
      dispatch({ type: 'MOVE_SELECTION', dr: 1, dc: 0, extend: false });
      e.preventDefault();
    } else if (e.key === 'Tab') {
      commitEdit(ri, ci);
      dispatch({ type: 'MOVE_SELECTION', dr: 0, dc: e.shiftKey ? -1 : 1, extend: false });
      e.preventDefault();
    } else if (e.key === 'Escape') {
      dispatch({ type: 'CANCEL_EDIT' });
      e.preventDefault();
    }
  }, [commitEdit, dispatch]);

  const handleContainerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editCell) return; // let the inline input handle keys

    // Ctrl combos
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          dispatch({ type: 'REDO' });
        } else {
          dispatch({ type: 'UNDO' });
        }
        e.preventDefault();
        return;
      }
      if (e.key === 'y' || e.key === 'Y') {
        dispatch({ type: 'REDO' });
        e.preventDefault();
        return;
      }
      return; // ignore other ctrl combos
    }

    switch (e.key) {
      case 'ArrowUp':
        dispatch({ type: 'MOVE_SELECTION', dr: -1, dc: 0, extend: e.shiftKey });
        e.preventDefault();
        break;
      case 'ArrowDown':
        dispatch({ type: 'MOVE_SELECTION', dr: 1, dc: 0, extend: e.shiftKey });
        e.preventDefault();
        break;
      case 'ArrowLeft':
        dispatch({ type: 'MOVE_SELECTION', dr: 0, dc: -1, extend: e.shiftKey });
        e.preventDefault();
        break;
      case 'ArrowRight':
        dispatch({ type: 'MOVE_SELECTION', dr: 0, dc: 1, extend: e.shiftKey });
        e.preventDefault();
        break;
      case 'Tab':
        dispatch({ type: 'MOVE_SELECTION', dr: 0, dc: e.shiftKey ? -1 : 1, extend: false });
        e.preventDefault();
        break;
      case 'Enter':
        dispatch({ type: 'MOVE_SELECTION', dr: 1, dc: 0, extend: false });
        e.preventDefault();
        break;
      case 'F2':
        if (editing) {
          dispatch({ type: 'START_EDIT', r: selection.focus.r, c: selection.focus.c });
        }
        e.preventDefault();
        break;
      case 'Delete':
      case 'Backspace':
        if (editing) {
          dispatch({
            type: 'SET_CELL',
            sheet: activeSheet,
            r: selection.focus.r,
            c: selection.focus.c,
            cell: null,
          });
        }
        e.preventDefault();
        break;
      case 'Escape':
        dispatch({ type: 'CANCEL_EDIT' });
        break;
      default:
        // Printable key starts edit
        if (editing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          dispatch({
            type: 'START_EDIT',
            r: selection.focus.r,
            c: selection.focus.c,
            initialValue: e.key,
          });
          e.preventDefault();
        }
    }
  }, [editCell, editing, dispatch, selection, activeSheet]);

  // Build column widths array padded to totalCols
  const effectiveColWidths = Array.from({ length: totalCols }, (_, ci) => colWidths[ci] ?? DEFAULT_COL_W);

  return (
    <div
      ref={containerRef}
      className={styles.grid}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      style={{ outline: 'none' }}
    >
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content' }}>
        <colgroup>
          <col style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W }} />
          {effectiveColWidths.map((w, ci) => (
            <col key={ci} style={{ width: w, minWidth: w }} />
          ))}
        </colgroup>

        <thead>
          <tr style={{ height: DEFAULT_ROW_H }}>
            {/* Corner */}
            <th className={styles.cornerCell} style={{ width: ROW_HEADER_W, height: DEFAULT_ROW_H }} />
            {/* Column headers */}
            {effectiveColWidths.map((w, ci) => (
              <th
                key={ci}
                className={`${styles.colHeader} ${isColSelected(ci, selection) ? styles.headerSelected : ''}`}
                style={{ width: w, height: DEFAULT_ROW_H }}
                onClick={() => handleColHeaderClick(ci)}
              >
                {colLetter(ci)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {Array.from({ length: totalRows }, (_, ri) => {
            const cells = sheet.cells[ri] ?? [];
            const rowH = rowHeights[ri] ?? DEFAULT_ROW_H;
            const rowSel = isRowSelected(ri, selection);

            return (
              <SheetRow
                key={ri}
                ri={ri}
                cells={cells}
                colWidths={effectiveColWidths}
                totalCols={totalCols}
                isRowSelected={rowSel}
                selection={selection}
                editCell={editCell}
                merges={sheet.merges}
                coveredSet={coveredSet}
                editing={editing}
                dispatch={dispatch}
                version={state.version}
                rowHeight={rowH}
                sheetIdx={activeSheet}
                engine={engine}
                onMouseDown={handleMouseDown}
                onMouseEnter={handleMouseEnter}
                onDoubleClick={handleDoubleClick}
                onRowHeaderClick={handleRowHeaderClick}
                onEditInputChange={handleEditInputChange}
                onEditInputKeyDown={handleEditInputKeyDown}
                editInputRef={editInputRef}
              />
            );
          })}
        </tbody>
      </table>

      {usedRows > MAX_ROWS && (
        <div className={styles.rowLimitNotice}>
          Showing {MAX_ROWS} of {usedRows} rows. Download to view all.
        </div>
      )}
    </div>
  );
}
