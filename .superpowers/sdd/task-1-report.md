# Phase 1 Spreadsheet Redesign — Task Report

## Status: DONE (pending type-check verification — classifier temporarily unavailable at report time)

## Files Created

### New files
- `hub/components/spreadsheet/types.ts` — Full type model: CellValue, BorderEdge, CellStyle, Cell, MergeRange, Range, SheetModel, WorkbookModel, Selection, UndoEntry union
- `hub/components/spreadsheet/coords.ts` — All coord utilities: colLetter, parseA1, toA1, parseRange, normalizeRange, iterRange (generator), buildCoveredSet, inRange, findMerge
- `hub/components/spreadsheet/formatting.ts` — formatCell() using ssf: handles null, Date (serial conversion), boolean (TRUE/FALSE), number (with/without numFmt), string; returns { text, defaultAlign }
- `hub/components/spreadsheet/excel-io.ts` — loadWorkbook + saveWorkbook with b64ToBuffer/bufToB64 helpers

### Modified files
- `hub/app/dashboard/preview/page.tsx` — Added `const [saved, setSaved] = useState(false)`, `const [saveError, setSaveError] = useState('')`, `const clearSaveState = () => { ... }` to PreviewPage state; added `saved?: boolean; saveError?: string` to EditorToolbar props interface
- `hub/package.json` — Added exceljs@^4.4.0 and ssf@^0.11.2 dependencies

## npm install output summary
- `exceljs@^4.4.0` and `ssf@^0.11.2` installed successfully (73 packages added)
- `@types/ssf` does NOT exist on npm registry (404) — ssf bundles its own types in `node_modules/ssf/types/index.d.ts`; no external @types package needed

## type-check result
- TypeScript classifier was temporarily unavailable during this run — could not execute `npm run type-check`
- Code reviewed manually for type correctness:
  - `formatting.ts`: uses `import * as SSF from 'ssf'` matching the named-export type declarations; `SSF.format()` call is correct
  - `coords.ts`: pure logic, no external types
  - `types.ts`: pure type declarations
  - `excel-io.ts`: avoids inline `import()` type references; formula value cast uses explicit object shape; null→undefined conversion for CellFormulaValue.result handled correctly

## Decisions made

### excel-io.ts edge cases
1. **@types/ssf missing**: ssf ships its own types at `node_modules/ssf/types/index.d.ts` pointing from `package.json#types`; no separate @types package needed or available
2. **ExcelJS CellFormulaValue.result**: ExcelJS type requires `result?: number|string|boolean|Date|CellErrorValue` (no null). We convert `null` → `undefined` before assignment
3. **Border style mapping**: ExcelJS has ~12 border style variants; we map to the 6 supported in CellStyle.BorderEdge (thin/medium/thick/dotted/dashed/double)
4. **Merge parsing**: ExcelJS stores merges as strings in `worksheet.model.merges` (e.g. 'A1:B2'); accessed via type cast since the public API doesn't expose it directly
5. **Row heights**: ExcelJS stores heights in "points" at ~0.75 pts/px; we multiply by 1.33 to convert to px
6. **XLS colWidths**: Used `cells.reduce()` instead of `Math.max(...cells.map(...), 0)` to avoid call stack overflow on empty arrays
7. **CSV parser**: Handles RFC 4180 quoting (doubled quotes inside quoted fields), CRLF/LF normalization, empty trailing row prevention
8. **Date serial**: JS Date → Excel serial = `date.getTime() / 86400000 + 25569` (Unix epoch to Excel epoch offset)
9. **Dynamic imports**: exceljs and xlsx are both dynamically imported (`await import(...)`) inside functions to keep them out of the initial bundle

## Commit hash
Pending — classifier unavailable at commit time
