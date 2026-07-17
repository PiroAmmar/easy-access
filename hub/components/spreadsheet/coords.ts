import type { MergeRange } from './types';

// Column index (0-based) to Excel letter: 0→'A', 25→'Z', 26→'AA', etc.
export function colLetter(col: number): string {
  let s = '';
  let n = col + 1;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

// Parse A1 notation → 0-based {r, c}. Returns null on invalid.
export function parseA1(ref: string): { r: number; c: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  const colStr = m[1].toUpperCase();
  const rowStr = m[2];
  let c = 0;
  for (let i = 0; i < colStr.length; i++) {
    c = c * 26 + (colStr.charCodeAt(i) - 64);
  }
  c -= 1; // 0-based
  const r = parseInt(rowStr, 10) - 1; // 0-based
  if (r < 0 || c < 0) return null;
  return { r, c };
}

// Convert 0-based {r, c} → A1 string
export function toA1(r: number, c: number): string {
  return `${colLetter(c)}${r + 1}`;
}

// Parse range like "A1:B3" or "A1" → MergeRange (r2=r1, c2=c1 for single cell)
export function parseRange(ref: string): MergeRange | null {
  const parts = ref.trim().split(':');
  if (parts.length === 1) {
    const cell = parseA1(parts[0]);
    if (!cell) return null;
    return { r1: cell.r, c1: cell.c, r2: cell.r, c2: cell.c };
  }
  if (parts.length === 2) {
    const a = parseA1(parts[0]);
    const b = parseA1(parts[1]);
    if (!a || !b) return null;
    return { r1: a.r, c1: a.c, r2: b.r, c2: b.c };
  }
  return null;
}

// Normalize so r1<=r2, c1<=c2
export function normalizeRange(r: MergeRange): MergeRange {
  return {
    r1: Math.min(r.r1, r.r2),
    c1: Math.min(r.c1, r.c2),
    r2: Math.max(r.r1, r.r2),
    c2: Math.max(r.c1, r.c2),
  };
}

// Iterate all {r,c} in range (normalized)
export function* iterRange(range: MergeRange): Generator<{ r: number; c: number }> {
  const nr = normalizeRange(range);
  for (let r = nr.r1; r <= nr.r2; r++) {
    for (let c = nr.c1; c <= nr.c2; c++) {
      yield { r, c };
    }
  }
}

// Build Set of "r,c" strings for covered cells (all except top-left of each merge)
export function buildCoveredSet(merges: MergeRange[]): Set<string> {
  const covered = new Set<string>();
  for (const merge of merges) {
    const nr = normalizeRange(merge);
    for (let r = nr.r1; r <= nr.r2; r++) {
      for (let c = nr.c1; c <= nr.c2; c++) {
        // Skip the top-left cell — it is the "owner"
        if (r === nr.r1 && c === nr.c1) continue;
        covered.add(`${r},${c}`);
      }
    }
  }
  return covered;
}

// True if {r,c} is within a MergeRange
export function inRange(r: number, c: number, range: MergeRange): boolean {
  const nr = normalizeRange(range);
  return r >= nr.r1 && r <= nr.r2 && c >= nr.c1 && c <= nr.c2;
}

// Find merge that owns this cell (returns the merge, or null)
export function findMerge(r: number, c: number, merges: MergeRange[]): MergeRange | null {
  for (const merge of merges) {
    if (inRange(r, c, merge)) return merge;
  }
  return null;
}
