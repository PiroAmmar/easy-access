export type CellValue = string | number | boolean | Date | null;

export interface BorderEdge {
  style: 'thin' | 'medium' | 'thick' | 'dotted' | 'dashed' | 'double';
  color: string; // #rrggbb
}

export interface CellStyle {
  fontFamily?: string;
  fontSize?: number; // points
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontColor?: string; // #rrggbb
  fill?: string; // #rrggbb solid fill
  hAlign?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  numFmt?: string; // Excel format code e.g. '#,##0.00'
  border?: {
    top?: BorderEdge;
    bottom?: BorderEdge;
    left?: BorderEdge;
    right?: BorderEdge;
  };
}

export interface Cell {
  v: CellValue;       // raw value (or formula cached result)
  f?: string;         // formula WITHOUT leading '=', e.g. 'SUM(A1:B3)'
  s?: CellStyle;
}

export interface MergeRange {
  r1: number; c1: number; r2: number; c2: number; // 0-based, inclusive
}

export type Range = MergeRange;

export interface SheetModel {
  name: string;
  cells: (Cell | null)[][];  // dense row-major; index [0][0] = spreadsheet A1
  colWidths: number[];       // px
  rowHeights: (number | null)[]; // px or null = default 24
  merges: MergeRange[];
}

export interface WorkbookModel {
  sheets: SheetModel[];
}

export interface Selection {
  sheet: number;
  anchor: { r: number; c: number };
  focus: { r: number; c: number };
}

export type UndoEntry =
  | { kind: 'cells'; sheet: number; patches: { r: number; c: number; before: Cell | null; after: Cell | null }[] }
  | { kind: 'colWidth'; sheet: number; col: number; before: number; after: number }
  | { kind: 'insertRows'; sheet: number; index: number; count: number }
  | { kind: 'deleteRows'; sheet: number; index: number; count: number; removed: (Cell | null)[][] }
  | { kind: 'insertCols'; sheet: number; index: number; count: number }
  | { kind: 'deleteCols'; sheet: number; index: number; count: number; removed: (Cell | null)[][] }
  | { kind: 'merge'; sheet: number; range: MergeRange; cellsBefore: { r: number; c: number; before: Cell | null }[] }
  | { kind: 'unmerge'; sheet: number; range: MergeRange };
