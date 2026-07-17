import type { WorkbookModel, SheetModel, Cell, CellStyle, CellValue, BorderEdge, MergeRange } from './types';
import { parseRange, toA1 } from './coords';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

export function bufToB64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  const CHUNK = 8192;
  let bin = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode(...u8.subarray(i, Math.min(i + CHUNK, u8.length)));
  }
  return btoa(bin);
}

// ─── ARGB → #rrggbb ──────────────────────────────────────────────────────────

function argbToHex(argb: string | undefined): string | undefined {
  if (!argb || argb.length < 6) return undefined;
  // ExcelJS returns ARGB as 8 hex chars: AARRGGBB
  const hex = argb.length === 8 ? argb.slice(2) : argb.length === 6 ? argb : undefined;
  return hex ? `#${hex.toLowerCase()}` : undefined;
}

// ─── Border edge mapping ──────────────────────────────────────────────────────

type ExcelBorderStyle = 'thin' | 'medium' | 'thick' | 'dotted' | 'dashed' | 'double' |
  'dashDot' | 'dashDotDot' | 'mediumDashDot' | 'mediumDashDotDot' | 'mediumDashed' |
  'slantDashDot' | 'hair' | undefined;

function mapBorderStyle(style: ExcelBorderStyle): BorderEdge['style'] {
  switch (style) {
    case 'medium':
    case 'mediumDashed':
    case 'mediumDashDot':
    case 'mediumDashDotDot':
      return 'medium';
    case 'thick':
      return 'thick';
    case 'dotted':
    case 'hair':
      return 'dotted';
    case 'dashed':
    case 'dashDot':
    case 'dashDotDot':
    case 'slantDashDot':
      return 'dashed';
    case 'double':
      return 'double';
    default:
      return 'thin';
  }
}

// ─── Load workbook ────────────────────────────────────────────────────────────

export async function loadWorkbook(b64: string, ext: string): Promise<WorkbookModel> {
  const normalExt = ext.toLowerCase();

  // ── XLSX / XLSM ──────────────────────────────────────────────────
  if (normalExt === '.xlsx' || normalExt === '.xlsm') {
    const _ejsMod = await import('exceljs');
    // CJS interop: Next.js webpack gives module.exports directly; Node.js ESM gives { default: module }
    const ExcelJS = ('Workbook' in _ejsMod ? _ejsMod : (_ejsMod as { default: typeof _ejsMod }).default) as typeof _ejsMod;
    const workbook = new ExcelJS.Workbook();
    const buffer = b64ToBuffer(b64);
    // ExcelJS declares Buffer as extending ArrayBuffer; the cast satisfies the type
    await workbook.xlsx.load(buffer as Parameters<typeof workbook.xlsx.load>[0]);

    const sheets: SheetModel[] = [];

    workbook.eachSheet((worksheet) => {
      const rowCount = worksheet.rowCount;
      const colCount = worksheet.columnCount;

      // Build dense cells array
      const cells: (Cell | null)[][] = [];

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const ri = rowNumber - 1; // 0-based
        while (cells.length <= ri) cells.push([]);
        const rowArr = cells[ri]!;

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const ci = colNumber - 1; // 0-based
          while (rowArr.length <= ci) rowArr.push(null);

          // Map value
          let v: CellValue = null;
          let f: string | undefined;

          const cellValue = cell.value;

          if (cellValue === null || cellValue === undefined) {
            v = null;
          } else if (typeof cellValue === 'object' && cellValue !== null && !(cellValue instanceof Date)) {
            // Could be formula result, rich text, hyperlink, or error
            const cv = cellValue as unknown as Record<string, unknown>;
            if ('formula' in cv || 'sharedFormula' in cv) {
              // Formula cell
              f = (cv.formula as string | undefined) ?? (cv.sharedFormula as string | undefined);
              const result = cv.result;
              if (result instanceof Date) {
                v = result;
              } else if (typeof result === 'number' || typeof result === 'boolean' || typeof result === 'string') {
                v = result;
              } else if (result === null || result === undefined) {
                v = null;
              } else {
                // Error or other
                v = String(result);
              }
            } else if ('richText' in cv && Array.isArray(cv.richText)) {
              // Rich text — join all runs
              v = (cv.richText as Array<{ text?: string }>).map((run) => run.text ?? '').join('');
            } else if ('text' in cv) {
              // Hyperlink
              v = String(cv.text ?? '');
            } else if ('error' in cv) {
              v = String(cv.error);
            } else {
              v = null;
            }
          } else if (cellValue instanceof Date) {
            v = cellValue;
          } else {
            v = cellValue as CellValue;
          }

          // Map style
          let s: CellStyle | undefined;
          const cs = cell.style;
          if (cs) {
            s = {};
            // Font
            if (cs.font) {
              if (cs.font.bold) s.bold = true;
              if (cs.font.italic) s.italic = true;
              if (cs.font.underline) s.underline = true;
              if (cs.font.size) s.fontSize = cs.font.size;
              if (cs.font.name) s.fontFamily = cs.font.name;
              if (cs.font.color?.argb) {
                const fc = argbToHex(cs.font.color.argb);
                if (fc) s.fontColor = fc;
              }
            }
            // Fill
            const fill = cs.fill as Record<string, unknown> | undefined;
            if (fill && fill.type === 'pattern') {
              const fgColor = fill.fgColor as Record<string, string> | undefined;
              if (fgColor?.argb) {
                const fc = argbToHex(fgColor.argb);
                if (fc) s.fill = fc;
              }
            }
            // Alignment
            if (cs.alignment) {
              const ha = cs.alignment.horizontal;
              if (ha === 'left' || ha === 'center' || ha === 'right') s.hAlign = ha;
              const va = cs.alignment.vertical;
              if (va === 'top' || va === 'middle' || va === 'bottom') s.vAlign = va;
              if (cs.alignment.wrapText) s.wrap = true;
            }
            // numFmt
            if (cs.numFmt) s.numFmt = cs.numFmt;
            // Border
            if (cs.border) {
              const border: CellStyle['border'] = {};
              if (cs.border.top?.style) {
                border.top = {
                  style: mapBorderStyle(cs.border.top.style as ExcelBorderStyle),
                  color: argbToHex((cs.border.top.color as Record<string, string> | undefined)?.argb) ?? '#000000',
                };
              }
              if (cs.border.bottom?.style) {
                border.bottom = {
                  style: mapBorderStyle(cs.border.bottom.style as ExcelBorderStyle),
                  color: argbToHex((cs.border.bottom.color as Record<string, string> | undefined)?.argb) ?? '#000000',
                };
              }
              if (cs.border.left?.style) {
                border.left = {
                  style: mapBorderStyle(cs.border.left.style as ExcelBorderStyle),
                  color: argbToHex((cs.border.left.color as Record<string, string> | undefined)?.argb) ?? '#000000',
                };
              }
              if (cs.border.right?.style) {
                border.right = {
                  style: mapBorderStyle(cs.border.right.style as ExcelBorderStyle),
                  color: argbToHex((cs.border.right.color as Record<string, string> | undefined)?.argb) ?? '#000000',
                };
              }
              if (Object.keys(border).length > 0) s.border = border;
            }
            // Clean up empty style object
            if (Object.keys(s).length === 0) s = undefined;
          }

          rowArr[ci] = { v, ...(f ? { f } : {}), ...(s ? { s } : {}) };
        });
      });

      // Pad rows so all rows have same length (not required but consistent)
      // Column widths: chars*7+5, default 64
      const colWidths: number[] = [];
      for (let ci = 0; ci < Math.max(colCount, 1); ci++) {
        const col = worksheet.getColumn(ci + 1);
        const w = col.width;
        colWidths.push(w !== undefined ? Math.round(w * 7 + 5) : 64);
      }

      // Row heights: px or null (default 24)
      const rowHeights: (number | null)[] = [];
      for (let ri = 0; ri < Math.max(rowCount, 1); ri++) {
        const row = worksheet.getRow(ri + 1);
        // row.height is a number but may be 0 if unset; treat 0 as default
        rowHeights.push(row.height ? Math.round(row.height * 1.33) : null);
      }

      // Merges: parse strings like 'A1:B2' from worksheet.model.merges
      const merges: MergeRange[] = [];
      const wsModel = worksheet.model;
      if (wsModel?.merges && Array.isArray(wsModel.merges)) {
        for (const mergeStr of wsModel.merges) {
          const range = parseRange(mergeStr);
          if (range) merges.push(range);
        }
      }

      sheets.push({
        name: worksheet.name,
        cells,
        colWidths,
        rowHeights,
        merges,
      });
    });

    if (sheets.length === 0) {
      sheets.push(emptySheet('Sheet1'));
    }
    return { sheets };
  }

  // ── XLS ──────────────────────────────────────────────────────────
  if (normalExt === '.xls') {
    const XLSX = await import('xlsx');
    const u8 = new Uint8Array(b64ToBuffer(b64));
    const wb = XLSX.read(u8, { type: 'array' });

    const sheets: SheetModel[] = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
      const cells: (Cell | null)[][] = raw.map((row) =>
        row.map((v) => {
          const val = v === '' ? null : (v as CellValue);
          return val === null ? null : { v: val };
        })
      );
      return {
        name,
        cells,
        colWidths: Array(cells.reduce((m, r) => Math.max(m, r.length), 0)).fill(64),
        rowHeights: cells.map(() => null),
        merges: [],
      };
    });

    return { sheets: sheets.length ? sheets : [emptySheet('Sheet1')] };
  }

  // ── CSV ──────────────────────────────────────────────────────────
  if (normalExt === '.csv') {
    const text = atob(b64);
    const rows = parseCsv(text);
    const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const cells: (Cell | null)[][] = rows.map((row) =>
      row.map((v) => (v === '' ? null : { v }))
    );
    return {
      sheets: [{
        name: 'Sheet1',
        cells,
        colWidths: Array(Math.max(maxCols, 0)).fill(64),
        rowHeights: cells.map(() => null),
        merges: [],
      }],
    };
  }

  // Fallback: empty workbook
  return { sheets: [emptySheet('Sheet1')] };
}

// ─── Save workbook ────────────────────────────────────────────────────────────

export async function saveWorkbook(model: WorkbookModel, ext: string): Promise<string> {
  const normalExt = ext.toLowerCase();

  // ── XLSX ─────────────────────────────────────────────────────────
  if (normalExt === '.xlsx' || normalExt === '.xlsm') {
    const _ejsMod = await import('exceljs');
    const ExcelJS = ('Workbook' in _ejsMod ? _ejsMod : (_ejsMod as { default: typeof _ejsMod }).default) as typeof _ejsMod;
    const workbook = new ExcelJS.Workbook();

    for (const sheetModel of model.sheets) {
      const worksheet = workbook.addWorksheet(sheetModel.name);

      // Set column widths
      for (let ci = 0; ci < sheetModel.colWidths.length; ci++) {
        const col = worksheet.getColumn(ci + 1);
        col.width = (sheetModel.colWidths[ci] - 5) / 7;
      }

      // Write cells
      for (let ri = 0; ri < sheetModel.cells.length; ri++) {
        const rowArr = sheetModel.cells[ri];
        if (!rowArr) continue;
        const row = worksheet.getRow(ri + 1);

        // Set row height if defined
        const rh = sheetModel.rowHeights[ri];
        if (rh !== null && rh !== undefined) {
          row.height = rh / 1.33;
        }

        for (let ci = 0; ci < rowArr.length; ci++) {
          const cell = rowArr[ci];
          if (!cell) continue;
          const xlCell = row.getCell(ci + 1);

          // Value / formula
          if (cell.f) {
            // ExcelJS CellFormulaValue: result must be number|string|boolean|Date|undefined (not null)
            const result = cell.v === null ? undefined : (cell.v as number | string | boolean | Date | undefined);
            xlCell.value = { formula: cell.f, result } as { formula: string; result?: number | string | boolean | Date };
          } else {
            // ExcelJS CellValue accepts null, number, string, boolean, Date
            xlCell.value = cell.v as null | number | string | boolean | Date;
          }

          // Style
          if (cell.s) {
            const s = cell.s;
            if (s.bold || s.italic || s.underline || s.fontSize || s.fontFamily || s.fontColor) {
              xlCell.font = {
                ...(s.bold ? { bold: true } : {}),
                ...(s.italic ? { italic: true } : {}),
                ...(s.underline ? { underline: true } : {}),
                ...(s.fontSize ? { size: s.fontSize } : {}),
                ...(s.fontFamily ? { name: s.fontFamily } : {}),
                ...(s.fontColor ? { color: { argb: 'FF' + s.fontColor.replace('#', '') } } : {}),
              };
            }
            if (s.fill) {
              xlCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF' + s.fill.replace('#', '') },
              };
            }
            if (s.hAlign || s.vAlign || s.wrap) {
              xlCell.alignment = {
                ...(s.hAlign ? { horizontal: s.hAlign } : {}),
                ...(s.vAlign ? { vertical: s.vAlign } : {}),
                ...(s.wrap ? { wrapText: true } : {}),
              };
            }
            if (s.numFmt) {
              xlCell.numFmt = s.numFmt;
            }
            if (s.border) {
              xlCell.border = {
                ...(s.border.top ? { top: { style: s.border.top.style, color: { argb: 'FF' + s.border.top.color.replace('#', '') } } } : {}),
                ...(s.border.bottom ? { bottom: { style: s.border.bottom.style, color: { argb: 'FF' + s.border.bottom.color.replace('#', '') } } } : {}),
                ...(s.border.left ? { left: { style: s.border.left.style, color: { argb: 'FF' + s.border.left.color.replace('#', '') } } } : {}),
                ...(s.border.right ? { right: { style: s.border.right.style, color: { argb: 'FF' + s.border.right.color.replace('#', '') } } } : {}),
              };
            }
          }
        }
        row.commit();
      }

      // Write merges
      for (const merge of sheetModel.merges) {
        const topLeft = toA1(merge.r1, merge.c1);
        const bottomRight = toA1(merge.r2, merge.c2);
        worksheet.mergeCells(`${topLeft}:${bottomRight}`);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return bufToB64(buffer as ArrayBuffer);
  }

  // ── CSV ──────────────────────────────────────────────────────────
  if (normalExt === '.csv') {
    const sheet = model.sheets[0];
    if (!sheet) return btoa('');
    const lines: string[] = sheet.cells.map((row) => {
      const fields = (row ?? []).map((cell) => {
        const val = cell?.v;
        if (val === null || val === undefined) return '';
        const str = val instanceof Date ? val.toISOString() : String(val);
        // Quote fields containing comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      });
      return fields.join(',');
    });
    const csv = lines.join('\r\n');
    // Encode as UTF-8 then base64
    const bytes = new TextEncoder().encode(csv);
    return bufToB64(bytes.buffer);
  }

  // ── XLS fallback ─────────────────────────────────────────────────
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sheetModel of model.sheets) {
    const aoa: (CellValue | undefined)[][] = sheetModel.cells.map((row) =>
      (row ?? []).map((cell) => cell?.v ?? undefined)
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa as Parameters<typeof XLSX.utils.aoa_to_sheet>[0]);
    XLSX.utils.book_append_sheet(wb, ws, sheetModel.name);
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as number[];
  return bufToB64(new Uint8Array(out).buffer);
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let i = 0;

  while (i <= lines.length) {
    const row: string[] = [];
    // Parse one row
    while (i < lines.length && lines[i] !== '\n') {
      if (lines[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = '';
        while (i < lines.length) {
          if (lines[i] === '"') {
            if (lines[i + 1] === '"') {
              // Escaped quote
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += lines[i++];
          }
        }
        row.push(field);
        // Skip comma after field
        if (i < lines.length && lines[i] === ',') i++;
      } else {
        // Unquoted field — read until comma or newline
        let field = '';
        while (i < lines.length && lines[i] !== ',' && lines[i] !== '\n') {
          field += lines[i++];
        }
        row.push(field);
        if (i < lines.length && lines[i] === ',') i++;
      }
    }
    if (i < lines.length) i++; // skip newline

    // Avoid pushing empty trailing row
    if (i > lines.length && row.length === 1 && row[0] === '') break;
    rows.push(row);

    if (i >= lines.length) break;
  }

  return rows.length ? rows : [[]];
}

// ─── Empty sheet factory ──────────────────────────────────────────────────────

function emptySheet(name: string): SheetModel {
  return {
    name,
    cells: [],
    colWidths: [],
    rowHeights: [],
    merges: [],
  };
}
