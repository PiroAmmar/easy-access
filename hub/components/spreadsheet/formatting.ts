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
    // Convert JS Date to Excel serial number: days since 1900-01-01 (with 1900 leap year bug offset)
    const serial = value.getTime() / 86400000 + 25569;
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
