// Unit test script for reducer undo/redo — run from easy-access/: npx tsx .superpowers/sdd/test-scripts/test-undo.ts
import { reducer, makeInitialState } from '../../../hub/components/spreadsheet/useSpreadsheetState';
import type { WorkbookModel } from '../../../hub/components/spreadsheet/types';
import type { SpreadsheetAction } from '../../../hub/components/spreadsheet/useSpreadsheetState';

let pass = 0, fail = 0;
function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}\n     got:      ${JSON.stringify(actual)}\n     expected: ${JSON.stringify(expected)}`); fail++; }
}

function dispatch(state: ReturnType<typeof makeInitialState>, ...actions: SpreadsheetAction[]) {
  return actions.reduce((s, a) => reducer(s, a), state);
}

function makeModel(): WorkbookModel {
  return {
    sheets: [{
      name: 'Sheet1',
      cells: [
        [{ v: 'A' }, { v: 'B' }],
        [{ v: 1 }, { v: 2 }],
      ],
      colWidths: [],
      rowHeights: [],
      merges: [],
    }],
  };
}

const initial = makeInitialState(makeModel());

// ─── SET_CELL + UNDO/REDO ─────────────────────────────────────────────────────

console.log('\n── SET_CELL + UNDO + REDO ────────────────────');

let s = dispatch(initial,
  { type: 'SET_CELL', sheet: 0, r: 0, c: 0, cell: { v: 'X' } }
);
assert('after SET_CELL, A1 = X', s.model.sheets[0].cells[0]?.[0]?.v, 'X');
assert('undo stack has 1 entry', s.undoStack.length, 1);
assert('redo stack is empty', s.redoStack.length, 0);

s = dispatch(s, { type: 'UNDO' });
assert('after UNDO, A1 = A', s.model.sheets[0].cells[0]?.[0]?.v, 'A');
assert('undo stack is empty', s.undoStack.length, 0);
assert('redo stack has 1 entry', s.redoStack.length, 1);

s = dispatch(s, { type: 'REDO' });
assert('after REDO, A1 = X', s.model.sheets[0].cells[0]?.[0]?.v, 'X');
assert('undo stack has 1 entry again', s.undoStack.length, 1);
assert('redo stack is empty again', s.redoStack.length, 0);

// ─── MULTIPLE EDITS + UNDO SEQUENCE ──────────────────────────────────────────

console.log('\n── MULTIPLE EDITS + UNDO ALL ─────────────────');

let s2 = dispatch(initial,
  { type: 'SET_CELL', sheet: 0, r: 0, c: 0, cell: { v: 'X' } },
  { type: 'SET_CELL', sheet: 0, r: 0, c: 1, cell: { v: 'Y' } },
  { type: 'SET_CELL', sheet: 0, r: 1, c: 0, cell: { v: 99 } },
);
assert('3 edits on stack', s2.undoStack.length, 3);

s2 = dispatch(s2, { type: 'UNDO' }, { type: 'UNDO' }, { type: 'UNDO' });
assert('undo all: A1 = A', s2.model.sheets[0].cells[0]?.[0]?.v, 'A');
assert('undo all: B1 = B', s2.model.sheets[0].cells[0]?.[1]?.v, 'B');
assert('undo all: A2 = 1', s2.model.sheets[0].cells[1]?.[0]?.v, 1);
assert('undo stack empty', s2.undoStack.length, 0);
assert('redo stack has 3', s2.redoStack.length, 3);

// ─── INSERT_ROWS + UNDO ────────────────────────────────────────────────────────

console.log('\n── INSERT_ROWS + UNDO ────────────────────────');

let s3 = dispatch(initial,
  { type: 'INSERT_ROWS', sheet: 0, rowIndex: 1, count: 1 }
);
// Original: row0=[A,B], row1=[1,2]. After insert at 1: row0=[A,B], row1=[], row2=[1,2]
assert('rows grew by 1', s3.model.sheets[0].cells.length, 3);
const cellAfterInsert = s3.model.sheets[0].cells[2]?.[0]?.v;
assert('original row1 shifted to row2', cellAfterInsert, 1);

s3 = dispatch(s3, { type: 'UNDO' });
assert('after undo insert: 2 rows', s3.model.sheets[0].cells.length, 2);
assert('row1 c0 restored to 1', s3.model.sheets[0].cells[1]?.[0]?.v, 1);

// ─── DELETE_ROWS + UNDO ────────────────────────────────────────────────────────

console.log('\n── DELETE_ROWS + UNDO ────────────────────────');

let s4 = dispatch(initial,
  { type: 'DELETE_ROWS', sheet: 0, rowIndex: 0, count: 1 }
);
assert('after delete row 0: row0 is now old row1', s4.model.sheets[0].cells[0]?.[0]?.v, 1);

s4 = dispatch(s4, { type: 'UNDO' });
assert('after undo delete: row0 = A', s4.model.sheets[0].cells[0]?.[0]?.v, 'A');
assert('after undo delete: row1 = 1', s4.model.sheets[0].cells[1]?.[0]?.v, 1);

// ─── SET_CELL_STYLE + UNDO ─────────────────────────────────────────────────────

console.log('\n── SET_CELL_STYLE + UNDO ─────────────────────');

let s5 = dispatch(initial,
  { type: 'SET_CELL_STYLE', sheet: 0, patches: [{ r: 0, c: 0 }], style: { bold: true } }
);
assert('bold applied', s5.model.sheets[0].cells[0]?.[0]?.s?.bold, true);

s5 = dispatch(s5, { type: 'UNDO' });
assert('bold removed after undo', s5.model.sheets[0].cells[0]?.[0]?.s?.bold, undefined);

// ─── REDO cleared on new edit ─────────────────────────────────────────────────

console.log('\n── REDO CLEARED ON NEW EDIT ──────────────────');

let s6 = dispatch(initial,
  { type: 'SET_CELL', sheet: 0, r: 0, c: 0, cell: { v: 'X' } },
);
s6 = dispatch(s6, { type: 'UNDO' });
assert('redo stack has 1', s6.redoStack.length, 1);
s6 = dispatch(s6, { type: 'SET_CELL', sheet: 0, r: 0, c: 0, cell: { v: 'Z' } });
assert('redo cleared after new edit', s6.redoStack.length, 0);
assert('new value applied', s6.model.sheets[0].cells[0]?.[0]?.v, 'Z');

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
