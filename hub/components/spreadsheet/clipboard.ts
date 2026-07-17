import type { SheetModel } from './types';
import { formatCell } from './formatting';

// Serialise a rectangular cell range to TSV (for text/plain clipboard interop with real Excel)
export function rangeToCsv(
  sheet: SheetModel,
  r1: number, c1: number, r2: number, c2: number
): string {
  const rows: string[] = [];
  for (let r = r1; r <= r2; r++) {
    const fields: string[] = [];
    for (let c = c1; c <= c2; c++) {
      const cell = sheet.cells[r]?.[c] ?? null;
      const { text } = formatCell(cell);
      // TSV: just join with \t; escape nothing (Excel TSV doesn't escape tabs within cells)
      fields.push(text);
    }
    rows.push(fields.join('\t'));
  }
  return rows.join('\n');
}

// Parse TSV from clipboard (from real Excel) into a 2D array of strings
export function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd()
    .split('\n')
    .map(line => line.split('\t'));
}

// Build an HTML table string for rich clipboard (preserves basic styles when pasting into Excel)
export function rangeToHtml(
  sheet: SheetModel,
  r1: number, c1: number, r2: number, c2: number
): string {
  let html = '<table>';
  for (let r = r1; r <= r2; r++) {
    html += '<tr>';
    for (let c = c1; c <= c2; c++) {
      const cell = sheet.cells[r]?.[c] ?? null;
      const { text } = formatCell(cell);
      const s = cell?.s;
      let style = '';
      if (s?.bold) style += 'font-weight:bold;';
      if (s?.italic) style += 'font-style:italic;';
      if (s?.fill) style += `background:${s.fill};`;
      if (s?.fontColor) style += `color:${s.fontColor};`;
      html += `<td style="${style}">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}
