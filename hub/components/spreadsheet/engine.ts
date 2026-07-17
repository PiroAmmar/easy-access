// engine.ts
// HyperFormula wrapper — the only file that imports hyperformula.
// All formula evaluation goes through this module.
// Swap point if the GPLv3 license becomes a concern.

import type { WorkbookModel } from './types';

// HyperFormula instance type (lazy)
type HF = import('hyperformula').HyperFormula;

let hfModule: typeof import('hyperformula') | null = null;

async function getHF() {
  if (!hfModule) {
    hfModule = await import('hyperformula');
  }
  return hfModule;
}

export class SpreadsheetEngine {
  private hf: HF | null = null;
  private sheetIds: number[] = [];

  async init(model: WorkbookModel): Promise<void> {
    const { HyperFormula } = await getHF();

    // Build sheets data for HyperFormula
    const sheetsData: Record<string, (string | number | boolean | null)[][]> = {};
    const sheetNames: string[] = [];

    for (const sheet of model.sheets) {
      const name = sheet.name;
      sheetNames.push(name);
      const data: (string | number | boolean | null)[][] = [];

      for (let r = 0; r < sheet.cells.length; r++) {
        const row: (string | number | boolean | null)[] = [];
        const rowArr = sheet.cells[r] ?? [];
        for (let c = 0; c < rowArr.length; c++) {
          const cell = rowArr[c];
          if (!cell) {
            row.push(null);
          } else if (cell.f) {
            row.push('=' + cell.f);
          } else if (typeof cell.v === 'string' || typeof cell.v === 'number' || typeof cell.v === 'boolean') {
            row.push(cell.v);
          } else if (cell.v instanceof Date) {
            // Convert date to serial number for HyperFormula
            row.push(cell.v.getTime() / 86400000 + 25569);
          } else {
            row.push(null);
          }
        }
        data.push(row);
      }
      sheetsData[name] = data;
    }

    this.hf = HyperFormula.buildFromSheets(sheetsData, {
      licenseKey: 'gpl-v3',
    });

    // Store sheet IDs
    this.sheetIds = sheetNames.map((name) => {
      const id = this.hf!.getSheetId(name);
      return id ?? -1;
    });
  }

  getDisplayValue(sheetIdx: number, r: number, c: number): string | number | boolean | null {
    if (!this.hf) return null;
    const sheetId = this.sheetIds[sheetIdx];
    if (sheetId === undefined || sheetId === -1) return null;
    try {
      const val = this.hf.getCellValue({ sheet: sheetId, row: r, col: c });
      if (val === null || val === undefined) return null;
      // HyperFormula may return error objects
      if (typeof val === 'object' && val !== null && 'type' in val) {
        return String((val as { type: string }).type); // e.g. "#REF!"
      }
      return val as string | number | boolean;
    } catch {
      return null;
    }
  }

  setCellValue(sheetIdx: number, r: number, c: number, value: string | number | boolean | null | undefined): void {
    if (!this.hf) return;
    const sheetId = this.sheetIds[sheetIdx];
    if (sheetId === undefined || sheetId === -1) return;
    try {
      const content = value === null || value === undefined ? null : value;
      this.hf.setCellContents({ sheet: sheetId, row: r, col: c }, [[content]]);
    } catch {
      // ignore
    }
  }

  setFormula(sheetIdx: number, r: number, c: number, formula: string): void {
    if (!this.hf) return;
    const sheetId = this.sheetIds[sheetIdx];
    if (sheetId === undefined || sheetId === -1) return;
    try {
      this.hf.setCellContents({ sheet: sheetId, row: r, col: c }, [['=' + formula]]);
    } catch {
      // ignore
    }
  }

  clearCell(sheetIdx: number, r: number, c: number): void {
    this.setCellValue(sheetIdx, r, c, null);
  }

  insertRows(sheetIdx: number, rowIndex: number, count: number): void {
    if (!this.hf) return;
    const sheetId = this.sheetIds[sheetIdx];
    if (sheetId === undefined || sheetId === -1) return;
    try {
      this.hf.addRows(sheetId, [rowIndex, count]);
    } catch { /* ignore */ }
  }

  removeRows(sheetIdx: number, rowIndex: number, count: number): void {
    if (!this.hf) return;
    const sheetId = this.sheetIds[sheetIdx];
    if (sheetId === undefined || sheetId === -1) return;
    try {
      this.hf.removeRows(sheetId, [rowIndex, count]);
    } catch { /* ignore */ }
  }

  insertCols(sheetIdx: number, colIndex: number, count: number): void {
    if (!this.hf) return;
    const sheetId = this.sheetIds[sheetIdx];
    if (sheetId === undefined || sheetId === -1) return;
    try {
      this.hf.addColumns(sheetId, [colIndex, count]);
    } catch { /* ignore */ }
  }

  removeCols(sheetIdx: number, colIndex: number, count: number): void {
    if (!this.hf) return;
    const sheetId = this.sheetIds[sheetIdx];
    if (sheetId === undefined || sheetId === -1) return;
    try {
      this.hf.removeColumns(sheetId, [colIndex, count]);
    } catch { /* ignore */ }
  }

  isReady(): boolean {
    return this.hf !== null;
  }

  destroy(): void {
    if (this.hf) {
      this.hf.destroy();
      this.hf = null;
      this.sheetIds = [];
    }
  }
}
