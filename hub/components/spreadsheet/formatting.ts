import * as SSF from 'ssf';
import type { Cell, CellValue } from './types';

// Format a cell's value for display using its numFmt.
// Returns { text: string, defaultAlign: 'left'|'right'|'center' }
export function formatCell(
  cell: Cell | null,
  computedValue?: CellValue,
): {
  text: string;
  defaultAlign: 'left' | 'right' | 'center';
} {
  // No cell or no value
  if (!cell) return { text: '', defaultAlign: 'left' };

  const value = computedValue !== undefined ? computedValue : cell.v;

  if (value === null || value === undefined) {
    return { text: '', defaultAlign: 'left' };
  }

  const numFmt = cell.s?.numFmt;

  // Date
  if (value instanceof Date) {
    const serial = dateToSerial(value);
    try {
      const fmt = numFmt ?? 'm/d/yyyy';
      return { text: SSF.format(fmt, serial), defaultAlign: 'right' };
    } catch {
      return { text: value.toLocaleDateString(), defaultAlign: 'right' };
    }
  }

  // Boolean
  if (typeof value === 'boolean') {
    return { text: value ? 'TRUE' : 'FALSE', defaultAlign: 'center' };
  }

  // Number
  if (typeof value === 'number') {
    if (numFmt) {
      try {
        return { text: SSF.format(numFmt, value), defaultAlign: 'right' };
      } catch {
        // fall through to String()
      }
    }
    return { text: String(value), defaultAlign: 'right' };
  }

  // String
  return { text: String(value), defaultAlign: 'left' };
}

// Excel serial from a JS Date using its LOCAL date/time components —
// getTime() alone is UTC and shifts the day for anyone east of Greenwich.
export function dateToSerial(value: Date): number {
  return (value.getTime() - value.getTimezoneOffset() * 60000) / 86400000 + 25569;
}

// Text shown in the inline editor / formula bar for an existing cell value.
// Dates render through their numFmt instead of JS Date.toString() noise.
export function editTextForValue(value: CellValue, numFmt?: string): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const serial = dateToSerial(value);
    try {
      return SSF.format(numFmt && numFmt !== 'General' ? numFmt : 'm/d/yyyy', serial);
    } catch {
      return value.toLocaleDateString();
    }
  }
  return String(value);
}

// Parse what the user typed into a typed cell value, the way Excel would:
// times → day-fraction numbers, date-looking strings → Date, numerics → number.
// numFmt (from the cell's existing style) disambiguates d/m vs m/d ordering.
export function parseInputToValue(raw: string, numFmt?: string): CellValue {
  const trimmed = raw.trim();
  if (trimmed === '') return raw;

  // Time: hh:mm or hh:mm:ss → Excel stores as fraction of a day
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (tm) {
    const h = +tm[1], m = +tm[2], s = +(tm[3] ?? 0);
    if (h < 24 && m < 60 && s < 60) return h / 24 + m / 1440 + s / 86400;
  }

  // Date: d/m/y or m/d/y (also - and . separators)
  const dm = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(trimmed);
  if (dm) {
    const a = +dm[1], b = +dm[2];
    let y = +dm[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    let day: number, mon: number;
    if (a > 12) { day = a; mon = b; }
    else if (b > 12) { mon = a; day = b; }
    else if (numFmt && /^d/i.test(numFmt)) { day = a; mon = b; } // format leads with day → d/m/y
    else { mon = a; day = b; }
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return new Date(y, mon - 1, day);
  }

  const num = Number(trimmed);
  if (!isNaN(num)) return num;
  return raw;
}
