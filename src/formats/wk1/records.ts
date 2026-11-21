// WK1 record type table (docs/formats/wk1.md). A record is: type u16le, length u16le, body.

export const REC = {
  BOF: 0x0000,
  EOF: 0x0001,
  RANGE: 0x0006,
  COLW1: 0x0008,
  NAME: 0x000b,
  BLANK: 0x000c,
  INTEGER: 0x000d,
  NUMBER: 0x000e,
  LABEL: 0x000f,
  FORMULA: 0x0010,
  STRING: 0x0033,
} as const;

export const RECORD_NAMES: ReadonlyMap<number, string> = new Map<number, string>([
  [REC.BOF, 'BOF'],
  [REC.EOF, 'EOF'],
  [REC.RANGE, 'RANGE'],
  [REC.COLW1, 'COLW1'],
  [REC.NAME, 'NAME'],
  [REC.BLANK, 'BLANK'],
  [REC.INTEGER, 'INTEGER'],
  [REC.NUMBER, 'NUMBER'],
  [REC.LABEL, 'LABEL'],
  [REC.FORMULA, 'FORMULA'],
  [REC.STRING, 'STRING'],
]);

/** Record types whose body starts with fmt (u8), col (u16), row (u16). */
export const CELL_RECORDS: ReadonlySet<number> = new Set([
  REC.BLANK, REC.INTEGER, REC.NUMBER, REC.LABEL, REC.FORMULA, REC.STRING,
]);

export const BOF_VERSIONS = { '1A': 0x0404, symphony: 0x0405, '2': 0x0406 } as const;

export const MAX_COLS = 256;
/** Row limit per version: 8192 for 1-2-3 2.x, 2048 for 1A and Symphony. */
export function rowLimit(version: '1A' | '2' | 'symphony'): number {
  return version === '2' ? 8192 : 2048;
}

/** Label alignment prefix characters. */
export const ALIGN_PREFIX = { left: "'", right: '"', center: '^', repeat: '\\' } as const;
export type Align = keyof typeof ALIGN_PREFIX;
export const PREFIX_ALIGN: ReadonlyMap<string, Align> = new Map<string, Align>([
  ["'", 'left'], ['"', 'right'], ['^', 'center'], ['\\', 'repeat'],
]);

/** Spreadsheet-style address of a cell: col 0 -> A, 26 -> AA; row 0 -> 1. */
export function cellName(col: number, row: number): string {
  let s = '';
  let c = col;
  do {
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return `${s}${row + 1}`;
}
