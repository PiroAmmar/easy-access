# Phase 6 Report — Save Flow Polish, Disclaimer Bullets, Ribbon View-Mode Disable, Missing CSS Classes

## Status: COMPLETE

## Changes made

### 1. preview/page.tsx
- Fixed `\${fileName}` escape bug in `addFeedback` success message (was printing literal `${fileName}`)
- Updated Excel disclaimer bullets to be per-extension:
  - `.xlsx`/`.xlsm`: "Formulas and cell formatting are preserved. Saving will overwrite the original file on the remote computer."
  - `.xls`: "This is a legacy format. Only cell values will be saved — formatting and formulas will be lost. Consider saving as .xlsx instead."
  - `.csv`: "Only the first sheet will be saved. All values are saved as plain text."
- `onRequestEdit={() => setXlsxDisclaimer(true)}` was already correct (no change needed)
- `onConfirm` already sets `setXlEditing(true)` and `setXlsxDisclaimer(false)` (no change needed)

### 2. SpreadsheetViewer.tsx
- Save button already shows "Saving…" when `saving` prop is true and is disabled (no change needed)
- Changed saved flash text from `Saved` → `✓ Saved`
- Changed saved flash timeout from 3000ms → 2000ms
- Save error already shows in action bar via `errorBadge` (no change needed)
- Save flow already correctly calls `saveWorkbook(state.model, ext)` then `doSave(b64)` (no change needed)

### 3. Ribbon.tsx
- Already correct: all editing-dependent buttons use `disabled={!editing}`
- Copy button (`RibbonButton onClick={handleCopy}`) has no `disabled` prop → always enabled
- Find & Replace button explicitly has `disabled={false}` → always enabled
- `RibbonButton` and `RibbonDropdown` in `RibbonControls.tsx` apply `opacity: 0.4; pointer-events: none` inline style when disabled

### 4. spreadsheet.module.css
- `.cellEditInput` already exists (no change needed)
- `.rowLimitNotice` already exists (no change needed)

### 5. TypeScript / Lint
- `npx tsc --noEmit` → zero errors
- `npm run lint` → no ESLint config in project (next lint prompts interactively for initial setup); TypeScript check is the effective gate

## One-line summary
Wired per-extension disclaimer bullets for xlsx/xls/csv, fixed `\${fileName}` escape bug, changed saved flash to "✓ Saved" with 2s timeout; CSS classes and ribbon view-mode disable were already correct.
