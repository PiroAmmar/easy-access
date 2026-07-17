# Phase 2 Report — Light Excel Grid

## Files Created

### `hub/components/spreadsheet/spreadsheet.module.css`
CSS Module with classic light Excel palette (white cells, gray headers, green #217346 accents). All colors as CSS custom properties scoped to `.viewer`. Classes: `.viewer`, `.actionBar`, `.formulaBar`, `.nameBox`, `.fxLabel`, `.fxInput`, `.grid`, `.colHeader`, `.rowHeader`, `.cornerCell`, `.cell`, `.cellSelected`, `.cellEditing`, `.cellInRange`, `.headerSelected`, `.sheetTabs`, `.sheetTab`, `.sheetTabActive`, `.truncated`, `.cellEditInput`, `.rowLimitNotice`, `.loadingState`, `.errorState`, and action bar button classes.

### `hub/components/spreadsheet/useSpreadsheetState.ts`
`useReducer`-based state hook. State: `model`, `activeSheet`, `selection`, `editCell`, `undoStack`, `redoStack`, `version`. All 10 actions implemented: `SET_MODEL`, `SET_ACTIVE_SHEET`, `SET_SELECTION`, `MOVE_SELECTION`, `START_EDIT`, `COMMIT_EDIT`, `CANCEL_EDIT`, `SET_CELL`, `UNDO`, `REDO`. Undo stack capped at 100. Exported helper: `getCell()`.

### `hub/components/spreadsheet/FormulaBar.tsx`
Name box (A1 or B2:D4 for ranges), "fx" italic label, editable input. Reads from state for cell address and value; dispatches `START_EDIT`/`COMMIT_EDIT`/`CANCEL_EDIT`.

### `hub/components/spreadsheet/SheetTabs.tsx`
Bottom tab bar. Hidden when only 1 sheet. Active tab has white background + 2px green top border. Dispatches `SET_ACTIVE_SHEET` on click.

### `hub/components/spreadsheet/Grid.tsx`
Full spreadsheet grid with:
- Sticky corner (z:4), sticky col headers (z:3), sticky row headers (z:2)
- 500-row limit, max(usedCols, 26) columns, colgroup with per-column widths
- Merge support via `buildCoveredSet` + `colSpan`/`rowSpan`
- Selection: green outline on focus cell, range fill for multi-cell
- Header highlight on selected row/col
- Mouse: click=select, drag=range, dblclick=edit, col/row header clicks=full select
- Keyboard: arrows, Tab, Enter, F2, printable chars, Delete, Escape, Ctrl+Z/Y
- Inline editing via absolutely-positioned `<input>`
- Memoized `SheetRow` sub-component for performance

### `hub/components/spreadsheet/SpreadsheetViewer.tsx`
Orchestrator. Props: `contentB64`, `ext`, `fileName`, `editing`, `onRequestEdit`, `doSave`, `saving`. Calls `loadWorkbook` on mount/contentB64 change, shows loading state. Renders: action bar → FormulaBar → Grid → SheetTabs. Save calls `saveWorkbook` then `doSave(b64)`. Cancel reloads original model.

## Files Modified

### `hub/app/dashboard/preview/page.tsx`
- Added import for new `SpreadsheetViewer`
- Replaced old `SpreadsheetViewer` component definition with import comment
- Replaced Excel state vars (`xlSheets`, `xlEditSheets`, `xlActiveSheet`, `xlError`, `xlDisclaimer`) with `xlRawB64`, `xlEditing`, `xlsxDisclaimer`
- Removed old Excel parse `useEffect` and `saveExcel` callback
- Updated fetch effect to set `xlRawB64` from response
- Updated `isXlsx` JSX branch to use new `SpreadsheetViewer` component
- All other file type renderers (docx, pptx, zip, pdf, image, video, text/code) unchanged

## Type Check Result

```
> tsc --noEmit
(zero errors)
```

## Commit Hash

See git log for commit on branch `feature/excel-design`.
