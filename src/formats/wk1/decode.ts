// WK1 decoder: bytes -> Specimen (SheetPayload). One top-level annotation group per record.
import { ByteReader } from '../../core/reader.js';
import { MAX_FILE_SIZE, MAX_RECORD_COUNT, assertLimit } from '../../core/limits.js';
import { latin1 } from '../../core/codepage.js';
import { ExhumeError } from '../../core/types.js';
import type { SheetCell, SheetPayload, Specimen, Warning } from '../../core/types.js';
import { decodeFormatByte, describeFormatByte } from './format-byte.js';
import { decompileFormula } from './formula.js';
import { BOF_VERSIONS, CELL_RECORDS, MAX_COLS, PREFIX_ALIGN, REC, RECORD_NAMES, cellName, rowLimit } from './records.js';

type Range = { startCol: number; startRow: number; endCol: number; endRow: number };

interface State {
  warnings: Warning[];
  version: SheetPayload['version'];
  range?: Range;
  columnWidths: Record<number, number>;
  names: SheetPayload['names'];
  cells: Map<number, SheetCell>;
  lastFormula: SheetCell | null;
  highByteAt: number | undefined;
}

const hex = (n: number): string => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;
const u16at = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);

function recordLabel(b: Uint8Array, at: number, type: number): string {
  const name = RECORD_NAMES.get(type);
  if (!name) return `record ${hex(type)}`;
  if (CELL_RECORDS.has(type) && at + 9 <= b.length) return `${name} ${cellName(u16at(b, at + 5), u16at(b, at + 7))}`;
  if (type === REC.COLW1 && at + 6 <= b.length) return `${name} ${cellName(u16at(b, at + 4), 0).replace(/\d+$/, '')}`;
  return name;
}

export function decode(bytes: Uint8Array): Specimen {
  if (bytes.length < 4 || u16at(bytes, 0) !== REC.BOF) throw new ExhumeError('not a WK1 file', 'wk1');
  assertLimit(bytes.length, MAX_FILE_SIZE, 'file size');
  const r = new ByteReader(bytes);
  const st: State = {
    warnings: [], version: '2', columnWidths: {}, names: [], cells: new Map(), lastFormula: null, highByteAt: undefined,
  };
  const warn = (message: string, offset?: number): void => {
    st.warnings.push(offset === undefined ? { message } : { message, offset });
  };

  let sawEof = false;
  let records = 0;
  while (r.remaining > 0) {
    assertLimit(++records, MAX_RECORD_COUNT, 'record count');
    const at = r.offset;
    if (r.remaining < 4) {
      r.group('truncated record', () => r.skip(r.remaining, 'bytes'));
      warn(`record header at offset ${at} is cut short`, at);
      break;
    }
    const type = u16at(bytes, at);
    const length = u16at(bytes, at + 2);
    const label = recordLabel(bytes, at, type);
    if (length > r.remaining - 4) {
      r.group(`${label} (truncated)`, () => {
        r.u16le('type');
        r.u16le('length');
        r.skip(r.remaining, 'body (cut short)');
      });
      warn(`${label} at offset ${at} needs ${length} bytes but only ${bytes.length - at - 4} remain`, at);
      break;
    }
    r.group(label, () => readRecord(r, st, type, length, warn));
    if (type === REC.EOF) { sawEof = true; break; }
  }
  if (sawEof && r.remaining > 0) {
    const at = r.offset;
    r.group('after EOF', () => r.skip(r.remaining, 'bytes'));
    warn(`${bytes.length - at} bytes after the EOF record were ignored`, at);
  }
  if (!sawEof) warn('file ends without an EOF record: it is truncated', bytes.length);
  if (st.highByteAt !== undefined) {
    warn('text bytes >= 0x80 were decoded as ISO 8859-1 (1-2-3 used LICS); some characters may differ', st.highByteAt);
  }

  const cells = [...st.cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  const payload: SheetPayload = { kind: 'sheet', version: st.version, columnWidths: st.columnWidths, names: st.names, cells };
  if (st.range) payload.range = st.range;
  let maxCol = -1;
  let maxRow = -1;
  for (const c of cells) { maxCol = Math.max(maxCol, c.col); maxRow = Math.max(maxRow, c.row); }
  return {
    payload,
    annotations: r.annotations(),
    warnings: st.warnings,
    meta: { rowCount: maxRow + 1, colCount: maxCol + 1 },
  };
}

function readRecord(r: ByteReader, st: State, type: number, length: number, warn: (m: string, o?: number) => void): void {
  const start = r.offset;
  r.u16le('type');
  r.u16le('length');
  const bodyStart = r.offset;
  const end = bodyStart + length;
  const known = RECORD_NAMES.has(type);
  const minLength = bodyMin(type);
  if (known && length < minLength) {
    warn(`${RECORD_NAMES.get(type)} record at offset ${start} is ${length} bytes, expected at least ${minLength}: ignored`, start);
  } else if (!known) {
    // unknown record types are annotated by number and skipped without a warning
  } else {
    readBody(r, st, type, end, warn);
  }
  if (r.offset < end) r.skip(end - r.offset, known && length >= minLength ? 'extra bytes' : 'body');
  if (type !== REC.FORMULA && type !== REC.STRING && CELL_RECORDS.has(type)) st.lastFormula = null;
}

function bodyMin(type: number): number {
  switch (type) {
    case REC.BOF: return 2;
    case REC.RANGE: return 8;
    case REC.COLW1: return 3;
    case REC.NAME: return 24;
    case REC.BLANK: case REC.LABEL: case REC.STRING: return 5;
    case REC.INTEGER: return 7;
    case REC.NUMBER: return 13;
    case REC.FORMULA: return 15;
    default: return 0;
  }
}

function text(r: ByteReader, st: State, label: string, max: number): string {
  const start = r.offset;
  const s = r.nullString(label, max);
  if (st.highByteAt === undefined) {
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) >= 0x80) { st.highByteAt = start + i; break; }
  }
  return s;
}

function readBody(r: ByteReader, st: State, type: number, end: number, warn: (m: string, o?: number) => void): void {
  switch (type) {
    case REC.BOF: {
      const v = r.u16le('version');
      const found = (Object.entries(BOF_VERSIONS) as Array<[SheetPayload['version'], number]>).find(([, code]) => code === v);
      if (found) st.version = found[0];
      else warn(`unknown BOF version 0x${v.toString(16)}: read as 1-2-3 2.x`, r.offset - 2);
      return;
    }
    case REC.RANGE: {
      const startCol = r.u16le('startCol');
      const startRow = r.u16le('startRow');
      const endCol = r.u16le('endCol');
      const endRow = r.u16le('endRow');
      st.range = { startCol, startRow, endCol, endRow };
      return;
    }
    case REC.COLW1: {
      const col = r.u16le('col');
      const width = r.u8('width');
      if (col < MAX_COLS) st.columnWidths[col] = width;
      else warn(`column width for column ${col} is beyond column IV: skipped`, r.offset - 3);
      return;
    }
    case REC.NAME: {
      const raw = r.text(16, 'name', latin1);
      const nul = raw.indexOf('\0');
      const name = nul < 0 ? raw : raw.slice(0, nul);
      if (st.highByteAt === undefined) {
        for (let i = 0; i < name.length; i++) if (name.charCodeAt(i) >= 0x80) { st.highByteAt = r.offset - 16 + i; break; }
      }
      const startCol = r.u16le('startCol');
      const startRow = r.u16le('startRow');
      const endCol = r.u16le('endCol');
      const endRow = r.u16le('endRow');
      st.names.push({ name, range: { startCol, startRow, endCol, endRow } });
      return;
    }
    default:
      if (CELL_RECORDS.has(type)) readCell(r, st, type, end, warn);
  }
}

function readCell(r: ByteReader, st: State, type: number, end: number, warn: (m: string, o?: number) => void): void {
  const start = r.offset - 4;
  const fmtByte = r.peek() ?? 0;
  r.mark('format', r.offset, r.offset + 1, describeFormatByte(fmtByte));
  const format = decodeFormatByte(fmtByte);
  const col = r.u16le('col');
  const row = r.u16le('row');
  const name = cellName(col, row);
  const cell: SheetCell = { col, row, type: 'blank', value: null, format };
  let attach: SheetCell | null = null; // set when the STRING record completes an earlier formula

  switch (type) {
    case REC.BLANK: break;
    case REC.INTEGER:
      cell.type = 'integer';
      cell.value = r.i16le('value');
      break;
    case REC.NUMBER:
      cell.type = 'number';
      cell.value = r.f64le('value');
      break;
    case REC.LABEL: {
      cell.type = 'label';
      const s = text(r, st, 'text', end - r.offset);
      const align = PREFIX_ALIGN.get(s.charAt(0));
      if (align) {
        cell.value = s.slice(1);
        cell.align = align;
      } else {
        cell.value = s;
        cell.align = 'left';
        warn(`label ${name} has no alignment prefix: read as left aligned`, start);
      }
      break;
    }
    case REC.STRING: {
      const s = text(r, st, 'text', end - r.offset);
      const f = st.lastFormula;
      if (f && f.col === col && f.row === row) {
        f.value = s; // the text result of the formula just read; the notes give no alignment prefix here
        attach = f;
      } else {
        cell.type = 'label';
        cell.value = s;
        cell.align = 'left';
        warn(`STRING record for ${name} does not follow its formula: stored as a label`, start);
      }
      st.lastFormula = null;
      break;
    }
    case REC.FORMULA: {
      cell.type = 'formula';
      cell.value = r.f64le('value');
      const n = r.u16le('formulaLength');
      const avail = end - r.offset;
      const take = Math.min(n, avail);
      const code = r.buffer_.subarray(r.offset, r.offset + take);
      const f = take === n ? decompileFormula(code, col, row) : null;
      if (take < n) warn(`formula ${name} is cut short (${n} bytes declared, ${avail} present)`, r.offset);
      else if (f === null) warn(`formula ${name} could not be decompiled (unknown opcode or malformed bytecode): cached value kept`, r.offset);
      cell.formula = f;
      r.mark('formula', r.offset, r.offset + take, f ?? '(not decompiled)');
      break;
    }
  }

  if (attach) return;
  if (col >= MAX_COLS || row >= rowLimit(st.version)) {
    warn(`cell ${name} is outside the ${MAX_COLS}-column by ${rowLimit(st.version)}-row sheet: skipped`, start);
    return;
  }
  const key = row * MAX_COLS + col;
  if (st.cells.has(key)) warn(`cell ${name} is stored twice: the later record wins`, start);
  st.cells.set(key, cell);
  st.lastFormula = type === REC.FORMULA ? cell : null;
}
