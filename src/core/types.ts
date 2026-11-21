// Core types for Exhume

export class ExhumeError extends Error {
  constructor(
    message: string,
    public readonly formatId?: string,
  ) {
    super(message);
    this.name = 'ExhumeError';
  }
}

export interface Annotation {
  label: string;
  start: number;
  end: number;
  value?: string;
  children?: Annotation[];
}

export interface Warning {
  message: string;
  offset?: number;
}

// ---- Payload shapes ----

export interface ImagePayload {
  kind: 'image';
  width: number;
  height: number;
  bitsPerPixel: 1 | 4 | 8 | 24;
  palette?: [number, number, number][];
  pixels: Uint8Array;
  /** MacPaint only */
  patterns?: Uint8Array[];
}

export interface SheetCell {
  col: number;
  row: number;
  type: 'blank' | 'integer' | 'number' | 'label' | 'formula';
  value: number | string | null;
  formula?: string | null;
  align?: 'left' | 'right' | 'center' | 'repeat';
  format: { type: number; decimals: number; protected: boolean };
}

export interface SheetPayload {
  kind: 'sheet';
  version: '1A' | '2' | 'symphony';
  range?: { startCol: number; startRow: number; endCol: number; endRow: number };
  columnWidths: Record<number, number>;
  names: Array<{ name: string; range: { startCol: number; startRow: number; endCol: number; endRow: number } }>;
  cells: SheetCell[];
}

export interface TableField {
  name: string;
  type: 'C' | 'N' | 'F' | 'L' | 'D' | 'M';
  length: number;
  decimals: number;
}

export interface TableRecord {
  deleted: boolean;
  values: (string | number | boolean | null)[];
}

export interface TablePayload {
  kind: 'table';
  fields: TableField[];
  records: TableRecord[];
  lastUpdate: string; // "YYYY-MM-DD"
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  sup?: boolean;
  sub?: boolean;
}

export type DocumentBlock =
  | { type: 'paragraph'; runs: TextRun[] }
  | { type: 'pageBreak' };

export interface DocumentPayload {
  kind: 'document';
  blocks: DocumentBlock[];
  header?: string;
  footer?: string;
}

export type SpecimenPayload =
  | ImagePayload
  | SheetPayload
  | TablePayload
  | DocumentPayload;

// ---- Meta ----

export interface SpecimenMeta {
  /** Images */
  width?: number;
  height?: number;
  bitsPerPixel?: number;
  /** Amiga ILBM: bit planes stored in the file (bitsPerPixel describes the decoded payload) */
  bitPlanes?: number;
  /** Sheets */
  rowCount?: number;
  colCount?: number;
  /** Tables */
  recordCount?: number;
  fieldCount?: number;
  /** Documents */
  blockCount?: number;
  /** All */
  lastUpdate?: string;
  dotCommands?: string[];
}

// ---- Specimen ----

export interface Specimen {
  payload: SpecimenPayload;
  annotations: Annotation[];
  warnings: Warning[];
  meta: SpecimenMeta;
}

// ---- FormatModule ----

export interface FormatModule {
  id: string;
  name: string;
  born: number;
  died: number;
  extensions: string[];
  kind: 'image' | 'sheet' | 'table' | 'document';
  epitaph: string;
  detect(bytes: Uint8Array, fileName?: string): number; // [0,1], never throws
  decode(bytes: Uint8Array): Specimen;                  // throws only ExhumeError
  encode?(model: SpecimenPayload): Uint8Array;          // decode(encode(m)).payload deep-equals m
}
