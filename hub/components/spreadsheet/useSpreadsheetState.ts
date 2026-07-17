import { useReducer } from 'react';
import type { WorkbookModel, Cell, Selection, UndoEntry } from './types';

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

function makeInitialState(initialModel: WorkbookModel): SpreadsheetState {
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
  // Other kinds not implemented — return model unchanged
  return model;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: SpreadsheetState, action: SpreadsheetAction): SpreadsheetState {
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
