import { useReducer } from 'react';
import type { WorkbookModel, Cell, CellStyle, MergeRange, Selection, UndoEntry } from './types';

// ─── State ────────────────────────────────────────────────────────────────────

export interface SpreadsheetState {
  model: WorkbookModel;
  activeSheet: number;
  selection: Selection;
  editCell: { r: number; c: number; value: string } | null;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  version: number;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type SpreadsheetAction =
  | { type: 'SET_MODEL'; model: WorkbookModel }
  | { type: 'SET_ACTIVE_SHEET'; index: number }
  | { type: 'SET_SELECTION'; anchor: { r: number; c: number }; focus: { r: number; c: number } }
  | { type: 'MOVE_SELECTION'; dr: number; dc: number; extend: boolean }
  | { type: 'START_EDIT'; r: number; c: number; initialValue?: string }
  | { type: 'COMMIT_EDIT' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'SET_CELL'; sheet: number; r: number; c: number; cell: Cell | null }
  | { type: 'SET_CELLS_BATCH'; sheet: number; cells: { r: number; c: number; cell: Cell | null }[]; addUndo?: boolean }
  | { type: 'RESIZE_COL'; sheet: number; col: number; width: number }
  | { type: 'RESIZE_COL_COMMIT'; sheet: number; col: number; before: number; after: number }
  | { type: 'SET_CELL_STYLE'; sheet: number; patches: { r: number; c: number }[]; style: Partial<CellStyle> }
  | { type: 'SET_NUM_FMT'; sheet: number; patches: { r: number; c: number }[]; numFmt: string }
  | { type: 'INSERT_ROWS'; sheet: number; rowIndex: number; count: number }
  | { type: 'DELETE_ROWS'; sheet: number; rowIndex: number; count: number }
  | { type: 'INSERT_COLS'; sheet: number; colIndex: number; count: number }
  | { type: 'DELETE_COLS'; sheet: number; colIndex: number; count: number }
  | { type: 'MERGE_CELLS'; sheet: number; range: MergeRange }
  | { type: 'UNMERGE_CELLS'; sheet: number; range: MergeRange }
  | { type: 'SORT_ROWS'; sheet: number; colIndex: number; ascending: boolean }
  | { type: 'CLEAR_RANGE'; sheet: number; r1: number; c1: number; r2: number; c2: number; what: 'all' | 'contents' | 'formats' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCell(model: WorkbookModel, sheetIdx: number, r: number, c: number): Cell | null {
  const sheet = model.sheets[sheetIdx];
  if (!sheet) return null;
  return sheet.cells[r]?.[c] ?? null;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

const MAX_UNDO = 100;
const MAX_ROWS = 500;

function getSheetBounds(model: WorkbookModel, sheetIdx: number): { maxR: number; maxC: number } {
  const sheet = model.sheets[sheetIdx];
  if (!sheet) return { maxR: 0, maxC: 0 };
  const maxR = Math.max(MAX_ROWS - 1, sheet.cells.length - 1);
  const usedCols = sheet.cells.reduce((m, row) => Math.max(m, row?.length ?? 0), 0);
  const maxC = Math.max(25, usedCols - 1);
  return { maxR, maxC };
}

// Deep-clone a cell
function cloneCell(cell: Cell | null): Cell | null {
  if (!cell) return null;
  return { ...cell, ...(cell.s ? { s: { ...cell.s, ...(cell.s.border ? { border: { ...cell.s.border } } : {}) } } : {}) };
}

// Set a cell in model (immutably)
function modelSetCell(model: WorkbookModel, sheetIdx: number, r: number, c: number, cell: Cell | null): WorkbookModel {
  const sheets = model.sheets.map((s, si) => {
    if (si !== sheetIdx) return s;
    // Clone cells array
    const cells = s.cells.map((row) => (row ? [...row] : []));
    // Ensure rows exist
    while (cells.length <= r) cells.push([]);
    const row = cells[r]!;
    while (row.length <= c) row.push(null);
    row[c] = cell;
    return { ...s, cells };
  });
  return { ...model, sheets };
}

// Get a cell from model (with bounds check)
function modelGetCell(model: WorkbookModel, sheetIdx: number, r: number, c: number): Cell | null {
  const sheet = model.sheets[sheetIdx];
  if (!sheet) return null;
  return sheet.cells[r]?.[c] ?? null;
}

// ─── Initial state ─────────────────────────────────────────────────────────────

export function makeInitialState(initialModel: WorkbookModel): SpreadsheetState {
  return {
    model: initialModel,
    activeSheet: 0,
    selection: { sheet: 0, anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
    editCell: null,
    undoStack: [],
    redoStack: [],
    version: 0,
  };
}

// ─── Sheet cell helpers ────────────────────────────────────────────────────────

function shiftMergesRows(merges: MergeRange[], rowIndex: number, delta: number): MergeRange[] {
  return merges.map(m => {
    const nr = { ...m };
    if (delta > 0) {
      // insert: shift merges at or below rowIndex
      if (m.r1 >= rowIndex) { nr.r1 += delta; nr.r2 += delta; }
      else if (m.r2 >= rowIndex) { nr.r2 += delta; }
    } else {
      // delete: delta is negative count
      const count = -delta;
      const end = rowIndex + count - 1;
      if (m.r1 > end) { nr.r1 -= count; nr.r2 -= count; }
      else if (m.r1 >= rowIndex || m.r2 >= rowIndex) return null as unknown as MergeRange; // destroyed
    }
    return nr;
  }).filter(Boolean);
}

function shiftMergesCols(merges: MergeRange[], colIndex: number, delta: number): MergeRange[] {
  return merges.map(m => {
    const nr = { ...m };
    if (delta > 0) {
      if (m.c1 >= colIndex) { nr.c1 += delta; nr.c2 += delta; }
      else if (m.c2 >= colIndex) { nr.c2 += delta; }
    } else {
      const count = -delta;
      const end = colIndex + count - 1;
      if (m.c1 > end) { nr.c1 -= count; nr.c2 -= count; }
      else if (m.c1 >= colIndex || m.c2 >= colIndex) return null as unknown as MergeRange;
    }
    return nr;
  }).filter(Boolean);
}

// ─── Apply undo entry (forward or backward) ────────────────────────────────────

function applyUndo(model: WorkbookModel, entry: UndoEntry, forward: boolean): WorkbookModel {
  if (entry.kind === 'cells') {
    let m = model;
    for (const patch of entry.patches) {
      const cell = forward ? patch.after : patch.before;
      m = modelSetCell(m, entry.sheet, patch.r, patch.c, cell);
    }
    return m;
  }
  if (entry.kind === 'colWidth') {
    const width = forward ? entry.after : entry.before;
    const sheets = model.sheets.map((s, si) => {
      if (si !== entry.sheet) return s;
      const colWidths = [...s.colWidths];
      colWidths[entry.col] = width;
      return { ...s, colWidths };
    });
    return { ...model, sheets };
  }
  if (entry.kind === 'insertRows') {
    // forward = insert rows; backward = delete them
    const sheets = model.sheets.map((s, si) => {
      if (si !== entry.sheet) return s;
      let cells = s.cells.map(row => row ? [...row] : []);
      if (forward) {
        const empties: (Cell | null)[][] = Array.from({ length: entry.count }, () => []);
        cells = [...cells.slice(0, entry.index), ...empties, ...cells.slice(entry.index)];
      } else {
        cells = [...cells.slice(0, entry.index), ...cells.slice(entry.index + entry.count)];
      }
      const merges = forward
        ? shiftMergesRows(s.merges, entry.index, entry.count)
        : shiftMergesRows(s.merges, entry.index, -entry.count);
      return { ...s, cells, merges };
    });
    return { ...model, sheets };
  }
  if (entry.kind === 'deleteRows') {
    // forward = delete rows; backward = re-insert them
    const sheets = model.sheets.map((s, si) => {
      if (si !== entry.sheet) return s;
      let cells = s.cells.map(row => row ? [...row] : []);
      if (forward) {
        cells = [...cells.slice(0, entry.index), ...cells.slice(entry.index + entry.count)];
      } else {
        cells = [...cells.slice(0, entry.index), ...entry.removed, ...cells.slice(entry.index)];
      }
      const merges = forward
        ? shiftMergesRows(s.merges, entry.index, -entry.count)
        : shiftMergesRows(s.merges, entry.index, entry.count);
      return { ...s, cells, merges };
    });
    return { ...model, sheets };
  }
  if (entry.kind === 'insertCols') {
    const sheets = model.sheets.map((s, si) => {
      if (si !== entry.sheet) return s;
      const cells = s.cells.map(row => {
        if (!row) return [];
        const r = [...row];
        if (forward) {
          r.splice(entry.index, 0, ...Array(entry.count).fill(null));
        } else {
          r.splice(entry.index, entry.count);
        }
        return r;
      });
      const merges = forward
        ? shiftMergesCols(s.merges, entry.index, entry.count)
        : shiftMergesCols(s.merges, entry.index, -entry.count);
      return { ...s, cells, merges };
    });
    return { ...model, sheets };
  }
  if (entry.kind === 'deleteCols') {
    const sheets = model.sheets.map((s, si) => {
      if (si !== entry.sheet) return s;
      const cells = s.cells.map((row, ri) => {
        if (!row) return [];
        const r = [...row];
        if (forward) {
          r.splice(entry.index, entry.count);
        } else {
          const removedRow = entry.removed[ri] ?? [];
          r.splice(entry.index, 0, ...removedRow);
        }
        return r;
      });
      const merges = forward
        ? shiftMergesCols(s.merges, entry.index, -entry.count)
        : shiftMergesCols(s.merges, entry.index, entry.count);
      return { ...s, cells, merges };
    });
    return { ...model, sheets };
  }
  if (entry.kind === 'merge') {
    const sheets = model.sheets.map((s, si) => {
      if (si !== entry.sheet) return s;
      if (forward) {
        return { ...s, merges: [...s.merges, entry.range] };
      } else {
        // restore cells and remove merge
        let cells = s.cells.map(row => row ? [...row] : []);
        for (const p of entry.cellsBefore) {
          while (cells.length <= p.r) cells.push([]);
          const row = cells[p.r]!;
          while (row.length <= p.c) row.push(null);
          row[p.c] = p.before;
        }
        return { ...s, cells, merges: s.merges.filter(m => m !== entry.range && !(m.r1 === entry.range.r1 && m.c1 === entry.range.c1 && m.r2 === entry.range.r2 && m.c2 === entry.range.c2)) };
      }
    });
    return { ...model, sheets };
  }
  if (entry.kind === 'unmerge') {
    const sheets = model.sheets.map((s, si) => {
      if (si !== entry.sheet) return s;
      if (forward) {
        return { ...s, merges: s.merges.filter(m => !(m.r1 === entry.range.r1 && m.c1 === entry.range.c1 && m.r2 === entry.range.r2 && m.c2 === entry.range.c2)) };
      } else {
        return { ...s, merges: [...s.merges, entry.range] };
      }
    });
    return { ...model, sheets };
  }
  return model;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function reducer(state: SpreadsheetState, action: SpreadsheetAction): SpreadsheetState {
  switch (action.type) {
    case 'SET_MODEL': {
      return {
        ...state,
        model: action.model,
        activeSheet: 0,
        selection: { sheet: 0, anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
        editCell: null,
        undoStack: [],
        redoStack: [],
        version: state.version + 1,
      };
    }

    case 'SET_ACTIVE_SHEET': {
      const index = clamp(action.index, 0, state.model.sheets.length - 1);
      return {
        ...state,
        activeSheet: index,
        selection: { sheet: index, anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
        editCell: null,
      };
    }

    case 'SET_SELECTION': {
      return {
        ...state,
        selection: {
          sheet: state.activeSheet,
          anchor: action.anchor,
          focus: action.focus,
        },
        editCell: null,
      };
    }

    case 'MOVE_SELECTION': {
      const { maxR, maxC } = getSheetBounds(state.model, state.activeSheet);
      const newFocus = {
        r: clamp(state.selection.focus.r + action.dr, 0, maxR),
        c: clamp(state.selection.focus.c + action.dc, 0, maxC),
      };
      const newAnchor = action.extend ? state.selection.anchor : newFocus;
      return {
        ...state,
        selection: {
          sheet: state.activeSheet,
          anchor: newAnchor,
          focus: newFocus,
        },
        editCell: null,
      };
    }

    case 'START_EDIT': {
      let value: string;
      if (action.initialValue !== undefined) {
        value = action.initialValue;
      } else {
        const cell = modelGetCell(state.model, state.activeSheet, action.r, action.c);
        if (cell?.f) {
          value = '=' + cell.f;
        } else if (cell?.v !== null && cell?.v !== undefined) {
          value = String(cell.v);
        } else {
          value = '';
        }
      }
      return {
        ...state,
        selection: {
          sheet: state.activeSheet,
          anchor: { r: action.r, c: action.c },
          focus: { r: action.r, c: action.c },
        },
        editCell: { r: action.r, c: action.c, value },
      };
    }

    case 'COMMIT_EDIT': {
      if (!state.editCell) return state;
      const { r, c, value } = state.editCell;

      // Determine cell value from string
      let newCell: Cell | null;
      if (value === '' || value === null || value === undefined) {
        newCell = null;
      } else if (value.startsWith('=')) {
        // Formula
        const formula = value.slice(1);
        newCell = { v: null, f: formula };
      } else {
        // Try to parse as number
        const num = Number(value);
        const cellValue = value.trim() !== '' && !isNaN(num) ? num : value;
        newCell = { v: cellValue };
      }

      // Build undo entry
      const before = cloneCell(modelGetCell(state.model, state.activeSheet, r, c));
      const entry: UndoEntry = {
        kind: 'cells',
        sheet: state.activeSheet,
        patches: [{ r, c, before, after: newCell }],
      };

      const newModel = modelSetCell(state.model, state.activeSheet, r, c, newCell);

      return {
        ...state,
        model: newModel,
        editCell: null,
        undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry],
        redoStack: [],
        version: state.version + 1,
      };
    }

    case 'CANCEL_EDIT': {
      return { ...state, editCell: null };
    }

    case 'SET_CELL': {
      const before = cloneCell(modelGetCell(state.model, action.sheet, action.r, action.c));
      const entry: UndoEntry = {
        kind: 'cells',
        sheet: action.sheet,
        patches: [{ r: action.r, c: action.c, before, after: action.cell }],
      };
      const newModel = modelSetCell(state.model, action.sheet, action.r, action.c, action.cell);
      return {
        ...state,
        model: newModel,
        undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry],
        redoStack: [],
        version: state.version + 1,
      };
    }

    case 'SET_CELLS_BATCH': {
      const patches: { r: number; c: number; before: Cell | null; after: Cell | null }[] = [];
      let newModel = state.model;
      for (const { r, c, cell } of action.cells) {
        const before = cloneCell(modelGetCell(newModel, action.sheet, r, c));
        patches.push({ r, c, before, after: cell });
        newModel = modelSetCell(newModel, action.sheet, r, c, cell);
      }
      if (action.addUndo) {
        const entry: UndoEntry = { kind: 'cells', sheet: action.sheet, patches };
        return {
          ...state,
          model: newModel,
          undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry],
          redoStack: [],
          version: state.version + 1,
        };
      }
      return { ...state, model: newModel, version: state.version + 1 };
    }

    case 'RESIZE_COL': {
      // Live update — no undo entry
      const sheets = state.model.sheets.map((s, si) => {
        if (si !== action.sheet) return s;
        const colWidths = [...s.colWidths];
        colWidths[action.col] = action.width;
        return { ...s, colWidths };
      });
      return { ...state, model: { ...state.model, sheets }, version: state.version + 1 };
    }

    case 'RESIZE_COL_COMMIT': {
      const sheets = state.model.sheets.map((s, si) => {
        if (si !== action.sheet) return s;
        const colWidths = [...s.colWidths];
        colWidths[action.col] = action.after;
        return { ...s, colWidths };
      });
      const entry: UndoEntry = { kind: 'colWidth', sheet: action.sheet, col: action.col, before: action.before, after: action.after };
      return {
        ...state,
        model: { ...state.model, sheets },
        undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry],
        redoStack: [],
        version: state.version + 1,
      };
    }

    case 'SET_CELL_STYLE': {
      const patches: { r: number; c: number; before: Cell | null; after: Cell | null }[] = [];
      let newModel = state.model;
      for (const { r, c } of action.patches) {
        const before = cloneCell(modelGetCell(newModel, action.sheet, r, c));
        const existing = modelGetCell(newModel, action.sheet, r, c);
        const newS = { ...(existing?.s ?? {}), ...action.style };
        const after: Cell = { ...(existing ?? { v: null }), s: newS };
        patches.push({ r, c, before, after });
        newModel = modelSetCell(newModel, action.sheet, r, c, after);
      }
      const entry: UndoEntry = { kind: 'cells', sheet: action.sheet, patches };
      return { ...state, model: newModel, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'SET_NUM_FMT': {
      const patches: { r: number; c: number; before: Cell | null; after: Cell | null }[] = [];
      let newModel = state.model;
      for (const { r, c } of action.patches) {
        const before = cloneCell(modelGetCell(newModel, action.sheet, r, c));
        const existing = modelGetCell(newModel, action.sheet, r, c);
        const newS = { ...(existing?.s ?? {}), numFmt: action.numFmt };
        const after: Cell = { ...(existing ?? { v: null }), s: newS };
        patches.push({ r, c, before, after });
        newModel = modelSetCell(newModel, action.sheet, r, c, after);
      }
      const entry: UndoEntry = { kind: 'cells', sheet: action.sheet, patches };
      return { ...state, model: newModel, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'INSERT_ROWS': {
      const { sheet: si, rowIndex, count } = action;
      const sheets = state.model.sheets.map((s, idx) => {
        if (idx !== si) return s;
        const cells = s.cells.map(row => row ? [...row] : []);
        const empties: (Cell | null)[][] = Array.from({ length: count }, () => []);
        const newCells = [...cells.slice(0, rowIndex), ...empties, ...cells.slice(rowIndex)];
        const merges = shiftMergesRows(s.merges, rowIndex, count);
        return { ...s, cells: newCells, merges };
      });
      const entry: UndoEntry = { kind: 'insertRows', sheet: si, index: rowIndex, count };
      return { ...state, model: { ...state.model, sheets }, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'DELETE_ROWS': {
      const { sheet: si, rowIndex, count } = action;
      let removed: (Cell | null)[][] = [];
      const sheets = state.model.sheets.map((s, idx) => {
        if (idx !== si) return s;
        const cells = s.cells.map(row => row ? [...row] : []);
        removed = cells.slice(rowIndex, rowIndex + count).map(row => [...row]);
        const newCells = [...cells.slice(0, rowIndex), ...cells.slice(rowIndex + count)];
        const merges = shiftMergesRows(s.merges, rowIndex, -count);
        return { ...s, cells: newCells, merges };
      });
      const entry: UndoEntry = { kind: 'deleteRows', sheet: si, index: rowIndex, count, removed };
      return { ...state, model: { ...state.model, sheets }, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'INSERT_COLS': {
      const { sheet: si, colIndex, count } = action;
      const sheets = state.model.sheets.map((s, idx) => {
        if (idx !== si) return s;
        const cells = s.cells.map(row => {
          if (!row) return [];
          const r = [...row];
          r.splice(colIndex, 0, ...Array(count).fill(null));
          return r;
        });
        const merges = shiftMergesCols(s.merges, colIndex, count);
        return { ...s, cells, merges };
      });
      const entry: UndoEntry = { kind: 'insertCols', sheet: si, index: colIndex, count };
      return { ...state, model: { ...state.model, sheets }, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'DELETE_COLS': {
      const { sheet: si, colIndex, count } = action;
      const sheetForCols = state.model.sheets[si];
      const removed: (Cell | null)[][] = sheetForCols
        ? sheetForCols.cells.map(row => row ? row.slice(colIndex, colIndex + count) : Array(count).fill(null) as (Cell | null)[])
        : [];
      const sheets = state.model.sheets.map((s, idx) => {
        if (idx !== si) return s;
        const cells = s.cells.map(row => {
          if (!row) return [];
          const r = [...row];
          r.splice(colIndex, count);
          return r;
        });
        const merges = shiftMergesCols(s.merges, colIndex, -count);
        return { ...s, cells, merges };
      });
      const entry: UndoEntry = { kind: 'deleteCols', sheet: si, index: colIndex, count, removed };
      return { ...state, model: { ...state.model, sheets }, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'MERGE_CELLS': {
      const { sheet: si, range } = action;
      const cellsBefore: { r: number; c: number; before: Cell | null }[] = [];
      let newModel = state.model;
      const sheet = newModel.sheets[si];
      if (!sheet) return state;
      // Save cells, clear non-top-left cells
      for (let r = range.r1; r <= range.r2; r++) {
        for (let c = range.c1; c <= range.c2; c++) {
          const before = cloneCell(modelGetCell(newModel, si, r, c));
          cellsBefore.push({ r, c, before });
          if (r !== range.r1 || c !== range.c1) {
            newModel = modelSetCell(newModel, si, r, c, null);
          }
        }
      }
      const newSheets = newModel.sheets.map((s, idx) => {
        if (idx !== si) return s;
        return { ...s, merges: [...s.merges, range] };
      });
      newModel = { ...newModel, sheets: newSheets };
      const entry: UndoEntry = { kind: 'merge', sheet: si, range, cellsBefore };
      return { ...state, model: newModel, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'UNMERGE_CELLS': {
      const { sheet: si, range } = action;
      const sheets = state.model.sheets.map((s, idx) => {
        if (idx !== si) return s;
        return { ...s, merges: s.merges.filter(m => !(m.r1 === range.r1 && m.c1 === range.c1 && m.r2 === range.r2 && m.c2 === range.c2)) };
      });
      const entry: UndoEntry = { kind: 'unmerge', sheet: si, range };
      return { ...state, model: { ...state.model, sheets }, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'SORT_ROWS': {
      const { sheet: si, colIndex, ascending } = action;
      const sheetObj = state.model.sheets[si];
      if (!sheetObj) return state;
      // Save original cells for undo
      const maxCols = sheetObj.cells.reduce((m, row) => Math.max(m, row?.length ?? 0), 0);
      const beforeRows = sheetObj.cells.map(row => row ? [...row] : []);
      const sorted = beforeRows.map(row => row ? [...row] : []);
      sorted.sort((a, b) => {
        const va = a[colIndex]?.v ?? null;
        const vb = b[colIndex]?.v ?? null;
        if (va === null && vb === null) return 0;
        if (va === null) return ascending ? 1 : -1;
        if (vb === null) return ascending ? -1 : 1;
        if (typeof va === 'number' && typeof vb === 'number') return ascending ? va - vb : vb - va;
        const sa = String(va).toLowerCase();
        const sb = String(vb).toLowerCase();
        return ascending ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
      // Build undo patches: for each cell position, before = original, after = sorted
      const patches: { r: number; c: number; before: Cell | null; after: Cell | null }[] = [];
      for (let r = 0; r < Math.max(beforeRows.length, sorted.length); r++) {
        for (let c = 0; c < maxCols; c++) {
          const before = cloneCell(beforeRows[r]?.[c] ?? null);
          const after = cloneCell(sorted[r]?.[c] ?? null);
          patches.push({ r, c, before, after });
        }
      }
      const newSheets = state.model.sheets.map((s, idx) => idx === si ? { ...s, cells: sorted } : s);
      const entry: UndoEntry = { kind: 'cells', sheet: si, patches };
      return { ...state, model: { ...state.model, sheets: newSheets }, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'CLEAR_RANGE': {
      const { sheet: si, r1, c1, r2, c2, what } = action;
      const patches: { r: number; c: number; before: Cell | null; after: Cell | null }[] = [];
      let newModel = state.model;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const before = cloneCell(modelGetCell(newModel, si, r, c));
          let after: Cell | null;
          if (what === 'all') {
            after = null;
          } else if (what === 'contents') {
            after = before ? { ...before, v: null, f: undefined } : null;
          } else { // formats
            after = before ? { ...before, s: undefined } : null;
          }
          patches.push({ r, c, before, after });
          newModel = modelSetCell(newModel, si, r, c, after);
        }
      }
      const entry: UndoEntry = { kind: 'cells', sheet: si, patches };
      return { ...state, model: newModel, undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), entry], redoStack: [], version: state.version + 1 };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const entry = state.undoStack[state.undoStack.length - 1]!;
      const newModel = applyUndo(state.model, entry, false);
      return {
        ...state,
        model: newModel,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, entry],
        editCell: null,
        version: state.version + 1,
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const entry = state.redoStack[state.redoStack.length - 1]!;
      const newModel = applyUndo(state.model, entry, true);
      return {
        ...state,
        model: newModel,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, entry],
        editCell: null,
        version: state.version + 1,
      };
    }

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSpreadsheetState(initialModel: WorkbookModel) {
  const [state, dispatch] = useReducer(reducer, initialModel, makeInitialState);
  return { state, dispatch };
}
