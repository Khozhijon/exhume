// WK1 encoder: SheetPayload -> a 1-2-3 release 2.x file.
//
// Valid-model rules (what makes decode(encode(m)).payload equal m; encode throws ExhumeError otherwise):
//  - version "2" (the only one written: BOF 0x0406). "1A" and "symphony" models are written as 2.x and
//    decode as "2".
//  - cells are unique and sorted by row, then column; col 0..255, row 0..8191.
//  - blank: value null. integer: an integer in -32768..32767 (never -0). number: any finite double
//    (-0 is kept). The `formula` and `align` properties are absent on these.
//  - label: a string of Latin-1 characters without NUL, with an `align`; written as prefix + text + NUL.
//  - formula: `formula` is a string in the canonical form the decompiler prints for the bytes the
//    compiler makes from it, at this cell; `value` is the cached number (finite) or, for a text
//    formula, the string (written as a STRING record after the FORMULA record).
//    A formula cell whose `formula` is null cannot be re-encoded: it is written as a NUMBER record with
//    its cached value (a LABEL when the value is text, a BLANK when null); that is lossy by design.
//  - format: any {type 0..7, decimals 0..15, protected}.
//  - range: the bounding box of the cells, or absent when there are no cells. (encode writes whatever
//    `range` holds; the box is only what 1-2-3 itself would have stored.)
//  - columnWidths: keys 0..255, widths 0..255. names: 0..15 Latin-1 characters without NUL, range in sheet.
import { ByteWriter } from '../../core/writer.js';
import { ExhumeError } from '../../core/types.js';
import type { SheetCell, SheetPayload, SpecimenPayload } from '../../core/types.js';
import { encodeFormatByte } from './format-byte.js';
import { compileFormula } from './formula-parse.js';
import { ALIGN_PREFIX, BOF_VERSIONS, MAX_COLS, REC, cellName } from './records.js';

const bad = (msg: string): never => {
  throw new ExhumeError(`wk1 encode: ${msg}`, 'wk1');
};

function latin1Bytes(s: string, what: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0 || c > 0xff) bad(`${what} holds a NUL or a character outside Latin-1`);
    out.push(c);
  }
  return out;
}

function record(w: ByteWriter, type: number, fill: (b: ByteWriter) => void): void {
  const b = new ByteWriter();
  fill(b);
  if (b.length > 0xffff) bad('record body longer than 65535 bytes');
  w.writeU16le(type);
  w.writeU16le(b.length);
  w.writeBytes(b.toUint8Array());
}

function cellHead(b: ByteWriter, c: SheetCell): void {
  b.writeU8(encodeFormatByte(c.format));
  b.writeU16le(c.col);
  b.writeU16le(c.row);
}

function writeLabel(w: ByteWriter, c: SheetCell, text: string, align: keyof typeof ALIGN_PREFIX): void {
  const body = latin1Bytes(text, `label ${cellName(c.col, c.row)}`);
  record(w, REC.LABEL, (b) => {
    cellHead(b, c);
    b.writeU8(ALIGN_PREFIX[align].charCodeAt(0));
    b.writeBytes(Uint8Array.from(body));
    b.writeU8(0);
  });
}

function writeCell(w: ByteWriter, c: SheetCell): void {
  const name = cellName(c.col, c.row);
  if (!Number.isInteger(c.col) || !Number.isInteger(c.row) || c.col < 0 || c.col >= MAX_COLS || c.row < 0 || c.row > 8191) {
    bad(`cell ${name} is outside the sheet`);
  }
  switch (c.type) {
    case 'blank':
      record(w, REC.BLANK, (b) => cellHead(b, c));
      return;
    case 'integer': {
      const v = c.value;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < -32768 || v > 32767 || Object.is(v, -0)) {
        bad(`integer cell ${name} needs an integer in -32768..32767`);
      }
      record(w, REC.INTEGER, (b) => { cellHead(b, c); b.writeI16le(v as number); });
      return;
    }
    case 'number': {
      const v = c.value;
      if (typeof v !== 'number' || !Number.isFinite(v)) bad(`number cell ${name} needs a finite number`);
      record(w, REC.NUMBER, (b) => { cellHead(b, c); b.writeF64le(v as number); });
      return;
    }
    case 'label':
      if (typeof c.value !== 'string') bad(`label cell ${name} needs a string value`);
      writeLabel(w, c, c.value as string, c.align ?? 'left');
      return;
    case 'formula':
      writeFormula(w, c, name);
  }
}

function writeFormula(w: ByteWriter, c: SheetCell, name: string): void {
  const v = c.value;
  if (typeof c.formula !== 'string') {
    // No formula text to compile: keep the cached result as a plain cell.
    if (typeof v === 'number') writeCell(w, { ...c, type: 'number' });
    else if (typeof v === 'string') writeLabel(w, c, v, 'left');
    else writeCell(w, { ...c, type: 'blank' });
    return;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) bad(`formula cell ${name} needs a finite cached value`);
  const code = compileFormula(c.formula, c.col, c.row);
  record(w, REC.FORMULA, (b) => {
    cellHead(b, c);
    b.writeF64le(typeof v === 'number' ? v : 0);
    b.writeU16le(code.length);
    b.writeBytes(code);
  });
  if (typeof v === 'string') {
    const body = latin1Bytes(v, `string result of ${name}`);
    record(w, REC.STRING, (b) => {
      cellHead(b, c);
      b.writeBytes(Uint8Array.from(body));
      b.writeU8(0);
    });
  }
}

export function encode(model: SpecimenPayload): Uint8Array {
  if (model.kind !== 'sheet') throw new ExhumeError('wk1 encode: payload is not a sheet', 'wk1');
  const m: SheetPayload = model;
  const w = new ByteWriter();
  record(w, REC.BOF, (b) => b.writeU16le(BOF_VERSIONS['2']));
  if (m.range) {
    const g = m.range;
    record(w, REC.RANGE, (b) => { b.writeU16le(g.startCol); b.writeU16le(g.startRow); b.writeU16le(g.endCol); b.writeU16le(g.endRow); });
  }
  for (const key of Object.keys(m.columnWidths).map(Number).sort((a, b) => a - b)) {
    const width = m.columnWidths[key];
    if (!Number.isInteger(key) || key < 0 || key >= MAX_COLS || width === undefined || !Number.isInteger(width) || width < 0 || width > 255) {
      bad(`column width ${key}:${String(width)} is not a column 0..255 with a width 0..255`);
    }
    record(w, REC.COLW1, (b) => { b.writeU16le(key); b.writeU8(width as number); });
  }
  for (const n of m.names) {
    const nameBytes = latin1Bytes(n.name, `name ${JSON.stringify(n.name)}`);
    if (nameBytes.length > 15) bad(`name ${JSON.stringify(n.name)} is longer than 15 characters`);
    record(w, REC.NAME, (b) => {
      b.writeBytes(Uint8Array.from([...nameBytes, ...new Array<number>(16 - nameBytes.length).fill(0)]));
      b.writeU16le(n.range.startCol); b.writeU16le(n.range.startRow); b.writeU16le(n.range.endCol); b.writeU16le(n.range.endRow);
    });
  }
  const cells = [...m.cells].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const c of cells) writeCell(w, c);
  record(w, REC.EOF, () => undefined);
  return w.toUint8Array().slice();
}
