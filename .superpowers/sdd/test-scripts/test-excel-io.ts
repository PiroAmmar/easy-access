// Unit test script for excel-io.ts — run from easy-access/: npx tsx .superpowers/sdd/test-scripts/test-excel-io.ts
// Tests that a styled workbook survives a save → load round-trip via exceljs

// node-fetch not available in Node 24 — use built-in fetch (available since Node 18)

let pass = 0, fail = 0;
function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}\n     got:      ${JSON.stringify(actual)}\n     expected: ${JSON.stringify(expected)}`); fail++; }
}
function assertClose(label: string, actual: number, expected: number, tolerance = 2) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}\n     got ${actual}, expected ${expected} ± ${tolerance}`); fail++; }
}
function assertTruthy(label: string, actual: unknown) {
  if (actual) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label} — falsy: ${JSON.stringify(actual)}`); fail++; }
}

import type { WorkbookModel } from '../../../hub/components/spreadsheet/types';

async function run() {
  // Dynamic import because excel-io uses dynamic imports internally
  const { loadWorkbook, saveWorkbook } = await import('../../../hub/components/spreadsheet/excel-io');

  const originalModel: WorkbookModel = {
    sheets: [
      {
        name: 'Data',
        colWidths: [20, 15, 10],
        rowHeights: [],
        merges: [{ r1: 2, c1: 0, r2: 2, c2: 1 }],
        cells: [
          // row 0: header with bold + fill
          [
            { v: 'Name', s: { bold: true, fill: '#FFD700' } },
            { v: 'Score', s: { bold: true } },
            { v: 'Rate', s: { bold: true } },
          ],
          // row 1: number + currency + percent
          [
            { v: 'Alice' },
            { v: 1234.5, s: { numFmt: '#,##0.00' } },
            { v: 0.1234, s: { numFmt: '0.00%' } },
          ],
          // row 2: merged cell (merge covers c0:c1)
          [
            { v: 'Merged cell text' },
            null,
            { v: 42 },
          ],
          // row 3: formula (saved with result, loaded back)
          [
            { v: 'Total' },
            { v: 2000, f: 'B2*2' },
            { v: null },
          ],
        ],
      },
      {
        name: 'Empty',
        colWidths: [],
        rowHeights: [],
        merges: [],
        cells: [],
      },
    ],
  };

  console.log('\n── save ──────────────────────────────────────');
  const b64 = await saveWorkbook(originalModel, '.xlsx');
  assertTruthy('saveWorkbook returns non-empty b64', b64 && b64.length > 0);

  console.log('\n── load (round-trip) ─────────────────────────');
  const loaded = await loadWorkbook(b64, '.xlsx');

  assert('sheet count', loaded.sheets.length, 2);
  assert('sheet 0 name', loaded.sheets[0].name, 'Data');
  assert('sheet 1 name', loaded.sheets[1].name, 'Empty');

  console.log('\n── cell values ───────────────────────────────');
  const s = loaded.sheets[0];
  assert('A1 value', s.cells[0]?.[0]?.v, 'Name');
  assert('B1 value', s.cells[0]?.[1]?.v, 'Score');
  assert('A2 value', s.cells[1]?.[0]?.v, 'Alice');
  assert('B2 value', s.cells[1]?.[1]?.v, 1234.5);
  assert('C2 value', s.cells[1]?.[2]?.v, 0.1234);

  console.log('\n── styles ────────────────────────────────────');
  assert('A1 bold', s.cells[0]?.[0]?.s?.bold, true);
  assert('B1 bold', s.cells[0]?.[1]?.s?.bold, true);
  assertTruthy('A1 fill non-empty', s.cells[0]?.[0]?.s?.fill);
  assert('B2 numFmt', s.cells[1]?.[1]?.s?.numFmt, '#,##0.00');

  console.log('\n── merges ────────────────────────────────────');
  assertTruthy('merges exist', s.merges.length > 0);
  const merge = s.merges[0];
  assert('merge r1', merge?.r1, 2);
  assert('merge r2', merge?.r2, 2);
  assert('merge c1', merge?.c1, 0);
  assert('merge c2', merge?.c2, 1);

  console.log('\n── column widths ─────────────────────────────');
  // exceljs stores widths in chars; we save original pixel widths as chars*7+5 → expect approximate
  assertTruthy('colWidths has entries', s.colWidths.length > 0);
  // Widths are stored as pixel values, so col 0 should be ~20*7+5 ≈ 145 or as stored
  // We just check they're positive numbers
  assertTruthy('colWidth[0] positive', (s.colWidths[0] ?? 0) > 0);

  console.log('\n── formula cell ──────────────────────────────');
  // formula cell: after round-trip the formula string should be preserved in .f
  // (exceljs saves formula+result, we load both)
  const formulaCell = s.cells[3]?.[1];
  assertTruthy('formula cell loaded', formulaCell !== undefined && formulaCell !== null);
  // Value should be preserved (either computed or stored result)
  assertTruthy('formula result ≥ 0', typeof formulaCell?.v === 'number');

  console.log('\n── CSV round-trip ────────────────────────────');
  const csvModel: WorkbookModel = {
    sheets: [{
      name: 'Sheet1',
      cells: [[{ v: 'a' }, { v: 'b' }], [{ v: 1 }, { v: 2 }]],
      colWidths: [], rowHeights: [], merges: [],
    }],
  };
  const csvB64 = await saveWorkbook(csvModel, '.csv');
  assertTruthy('csv b64 non-empty', csvB64.length > 0);
  const csvLoaded = await loadWorkbook(csvB64, '.csv');
  assert('csv sheet count', csvLoaded.sheets.length, 1);
  assert('csv A1', csvLoaded.sheets[0].cells[0]?.[0]?.v, 'a');
  assert('csv B2 (string — CSV is text-only)', csvLoaded.sheets[0].cells[1]?.[1]?.v, '2');

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
