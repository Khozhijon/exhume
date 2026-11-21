import { describe, expect, it } from 'vitest';
import { coverage, locate } from '../../core/annotations.js';
import { ExhumeError } from '../../core/types.js';
import type { SheetCell, SheetPayload, Specimen } from '../../core/types.js';
import { decode } from './decode.js';
import { encode } from './encode.js';
import { wk1 } from './index.js';
import { decodeFormatByte, encodeFormatByte, formatValue, serialToIso } from './format-byte.js';
import { compileFormula } from './formula-parse.js';

// ---- file assembler --------------------------------------------------------------------------
const u16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff];
const f64 = (v: number): number[] => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return [...b];
};
const rec = (type: number, ...body: number[]): number[] => [...u16(type), ...u16(body.length), ...body];
const txt = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const BOF = rec(0, ...u16(0x0406));
const EOF = rec(1);
const file = (...records: number[][]): Uint8Array => Uint8Array.from([...BOF, ...records.flat(), ...EOF]);
const label = (col: number, row: number, s: string, fmt = 0xff): number[] => rec(0x0f, fmt, ...u16(col), ...u16(row), ...txt(s), 0);
const integer = (col: number, row: number, v: number, fmt = 0): number[] => rec(0x0d, fmt, ...u16(col), ...u16(row), ...u16(v & 0xffff));
const number = (col: number, row: number, v: number, fmt = 0): number[] => rec(0x0e, fmt, ...u16(col), ...u16(row), ...f64(v));
const formula = (col: number, row: number, v: number, code: number[], fmt = 0): number[] =>
  rec(0x10, fmt, ...u16(col), ...u16(row), ...f64(v), ...u16(code.length), ...code);
const cell = (s: Specimen, col: number, row: number): SheetCell | undefined =>
  (s.payload as SheetPayload).cells.find((c) => c.col === col && c.row === row);
const msgs = (s: Specimen): string[] => s.warnings.map((w) => w.message);

describe('wk1 decode: cells', () => {
  it('INTEGER, NUMBER, LABEL and BLANK cells, sorted by row then column', () => {
    const s = decode(file(
      number(1, 1, 2.5, 0x82), integer(0, 1, -7), label(2, 0, '^Hi', 0x00), rec(0x0c, 0x80, ...u16(5), ...u16(0)), integer(0, 0, 300),
    ));
    expect(s.warnings).toEqual([]);
    const p = s.payload as SheetPayload;
    expect(p.version).toBe('2');
    expect(p.cells.map((c) => [c.col, c.row, c.type])).toEqual([
      [0, 0, 'integer'], [2, 0, 'label'], [5, 0, 'blank'], [0, 1, 'integer'], [1, 1, 'number'],
    ]);
    expect(cell(s, 0, 0)).toEqual({ col: 0, row: 0, type: 'integer', value: 300, format: { type: 0, decimals: 0, protected: false } });
    expect(cell(s, 0, 1)?.value).toBe(-7);
    expect(cell(s, 1, 1)).toEqual({ col: 1, row: 1, type: 'number', value: 2.5, format: { type: 0, decimals: 2, protected: true } });
    expect(cell(s, 5, 0)).toEqual({ col: 5, row: 0, type: 'blank', value: null, format: { type: 0, decimals: 0, protected: true } });
    expect(s.meta).toMatchObject({ rowCount: 2, colCount: 6 });
  });

  it('strips the label alignment prefix into align', () => {
    const s = decode(file(label(0, 0, "'left"), label(1, 0, '"right'), label(2, 0, '^mid'), label(3, 0, '\\-='), label(4, 0, "'")));
    const get = (c: number): [unknown, unknown] => [cell(s, c, 0)?.value, cell(s, c, 0)?.align];
    expect(get(0)).toEqual(['left', 'left']);
    expect(get(1)).toEqual(['right', 'right']);
    expect(get(2)).toEqual(['mid', 'center']);
    expect(get(3)).toEqual(['-=', 'repeat']);
    expect(get(4)).toEqual(['', 'left']);
    expect(s.warnings).toEqual([]);
  });

  it('a label without a prefix is kept whole, left aligned, with a warning', () => {
    const s = decode(file(label(0, 0, 'plain')));
    expect(cell(s, 0, 0)).toMatchObject({ value: 'plain', align: 'left' });
    expect(msgs(s).join('|')).toMatch(/no alignment prefix/);
  });

  it('bytes >= 0x80 decode as Latin-1 with one warning in total', () => {
    const s = decode(file(label(0, 0, "'caf\xe9"), label(1, 0, "'\xfcber")));
    expect(cell(s, 0, 0)?.value).toBe('caf\xe9');
    expect(cell(s, 1, 0)?.value).toBe('\xfcber');
    expect(msgs(s).filter((m) => /0x80/.test(m))).toHaveLength(1);
  });

  it('decodes the format byte', () => {
    expect(decodeFormatByte(0xa3)).toEqual({ type: 2, decimals: 3, protected: true });
    expect(decodeFormatByte(0x72)).toEqual({ type: 7, decimals: 2, protected: false });
    for (let b = 0; b < 256; b++) expect(encodeFormatByte(decodeFormatByte(b))).toBe(b);
  });

  it('a later record for the same cell wins, with a warning', () => {
    const s = decode(file(integer(0, 0, 1), integer(0, 0, 2)));
    expect(cell(s, 0, 0)?.value).toBe(2);
    expect(msgs(s).join('|')).toMatch(/stored twice/);
  });
});

describe('wk1 decode: structure records', () => {
  it('RANGE, COLW1 and NAME', () => {
    const name = [...txt('TOTALS'), ...new Array<number>(10).fill(0)];
    const s = decode(file(
      rec(6, ...u16(0), ...u16(0), ...u16(3), ...u16(9)),
      rec(8, ...u16(0), 20), rec(8, ...u16(4), 9),
      rec(0x0b, ...name, ...u16(1), ...u16(2), ...u16(3), ...u16(4)),
    ));
    const p = s.payload as SheetPayload;
    expect(p.range).toEqual({ startCol: 0, startRow: 0, endCol: 3, endRow: 9 });
    expect(p.columnWidths).toEqual({ 0: 20, 4: 9 });
    expect(p.names).toEqual([{ name: 'TOTALS', range: { startCol: 1, startRow: 2, endCol: 3, endRow: 4 } }]);
    expect(s.warnings).toEqual([]);
  });

  it('no RANGE record leaves range absent', () => {
    expect('range' in (decode(file()).payload as SheetPayload)).toBe(false);
  });

  it('BOF versions', () => {
    for (const [code, v] of [[0x0404, '1A'], [0x0405, 'symphony'], [0x0406, '2']] as const) {
      const b = Uint8Array.from([...rec(0, ...u16(code)), ...EOF]);
      expect((decode(b).payload as SheetPayload).version).toBe(v);
    }
    const odd = decode(Uint8Array.from([...rec(0, ...u16(0x1234)), ...EOF]));
    expect(msgs(odd).join('|')).toMatch(/unknown BOF version/);
  });

  it('unknown record types are annotated by number and skipped without a warning', () => {
    const s = decode(file(rec(0x1f, 1, 2, 3), integer(0, 0, 5), rec(0x4242)));
    expect(s.warnings).toEqual([]);
    expect(s.annotations.map((a) => a.label)).toContain('record 0x1F');
    expect(s.annotations.map((a) => a.label)).toContain('record 0x4242');
    expect(cell(s, 0, 0)?.value).toBe(5);
  });

  it('short bodies of known records are ignored with a warning', () => {
    const s = decode(file(rec(6, 1, 2, 3), rec(0x0d, 0, 0, 0), integer(1, 0, 9)));
    expect(msgs(s).filter((m) => /expected at least/.test(m))).toHaveLength(2);
    expect((s.payload as SheetPayload).cells).toHaveLength(1);
  });
});

describe('wk1 decode: limits', () => {
  it('skips cells beyond column IV or row 8192 with a warning', () => {
    const s = decode(file(integer(256, 0, 1), integer(0, 8192, 1), integer(255, 8191, 3)));
    expect((s.payload as SheetPayload).cells.map((c) => [c.col, c.row])).toEqual([[255, 8191]]);
    expect(msgs(s).filter((m) => /outside/.test(m))).toHaveLength(2);
  });

  it('a 1A file stops at row 2048', () => {
    const b = Uint8Array.from([...rec(0, ...u16(0x0404)), ...integer(0, 2048, 1), ...integer(0, 2047, 1), ...EOF]);
    const s = decode(b);
    expect((s.payload as SheetPayload).cells.map((c) => c.row)).toEqual([2047]);
    expect(s.warnings).toHaveLength(1);
  });

  it('column widths beyond column IV are skipped with a warning', () => {
    const s = decode(file(rec(8, ...u16(300), 5)));
    expect((s.payload as SheetPayload).columnWidths).toEqual({});
    expect(s.warnings).toHaveLength(1);
  });

  it('throws ExhumeError for a first record that is not BOF, and for short input', () => {
    expect(() => decode(Uint8Array.from([...integer(0, 0, 1), ...EOF]))).toThrow(new ExhumeError('not a WK1 file'));
    expect(() => decode(new Uint8Array(0))).toThrow(ExhumeError);
    expect(() => decode(Uint8Array.from([0, 0, 2]))).toThrow(ExhumeError);
  });
});

describe('wk1 decode: damage', () => {
  it('a file without EOF keeps its cells and warns', () => {
    const s = decode(Uint8Array.from([...BOF, ...integer(0, 0, 4)]));
    expect(cell(s, 0, 0)?.value).toBe(4);
    expect(msgs(s).join('|')).toMatch(/without an EOF/);
  });

  it('a file cut mid-record keeps what was read before and warns', () => {
    const full = file(integer(0, 0, 4), number(1, 0, 3.5));
    const cut = full.slice(0, full.length - 4 - 5);
    const s = decode(cut);
    expect(cell(s, 0, 0)?.value).toBe(4);
    expect(cell(s, 1, 0)).toBeUndefined();
    expect(msgs(s).some((m) => /needs 13 bytes/.test(m))).toBe(true);
    expect(coverage(s.annotations, cut.length).exact).toBe(true);
  });

  it('a cut record header warns', () => {
    const s = decode(Uint8Array.from([...BOF, 0x0d, 0x00]));
    expect(msgs(s).join('|')).toMatch(/header .* cut short/);
  });

  it('bytes after EOF are ignored with a warning', () => {
    const s = decode(Uint8Array.from([...file(integer(0, 0, 1)), 9, 9, 9]));
    expect(msgs(s).join('|')).toMatch(/3 bytes after the EOF/);
    expect(cell(s, 0, 0)?.value).toBe(1);
  });

  it('every proper prefix of a valid file warns or throws', () => {
    const full = file(label(0, 0, "'x"), formula(1, 0, 2, [...compileFormula('A1', 1, 0)]));
    for (let k = 0; k < full.length; k++) {
      try {
        expect(decode(full.slice(0, k)).warnings.length, `prefix ${k}`).toBeGreaterThan(0);
      } catch (e) {
        expect(e).toBeInstanceOf(ExhumeError);
      }
    }
  });
});

describe('wk1 decode: formulas', () => {
  it('decompiles the bytecode and keeps the cached value', () => {
    const code = [...compileFormula('@SUM(B2..B13)*1.1', 2, 13)];
    const s = decode(file(formula(2, 13, 42.5, code, 0x02)));
    expect(cell(s, 2, 13)).toEqual({
      col: 2, row: 13, type: 'formula', value: 42.5, formula: '@SUM(B2..B13)*1.1', format: { type: 0, decimals: 2, protected: false },
    });
    expect(s.warnings).toEqual([]);
  });

  it('an unknown opcode keeps the value, sets formula to null and warns', () => {
    const s = decode(file(formula(5, 3, 9, [0x00, ...f64(1), 0xee, 0x03])));
    expect(cell(s, 5, 3)).toMatchObject({ type: 'formula', value: 9, formula: null });
    expect(msgs(s).join('|')).toMatch(/formula F4 could not be decompiled/);
  });

  it('a following STRING record supplies the text value', () => {
    const code = [...compileFormula('@CHAR(65)', 0, 0)];
    const s = decode(file(formula(0, 0, 0, code), rec(0x33, 0, ...u16(0), ...u16(0), ...txt('A'), 0)));
    expect(cell(s, 0, 0)).toMatchObject({ type: 'formula', value: 'A', formula: '@CHAR(65)' });
    expect(s.warnings).toEqual([]);
  });

  it('a STRING record with no formula before it becomes a label', () => {
    const s = decode(file(integer(0, 0, 1), rec(0x33, 0, ...u16(1), ...u16(1), ...txt('lost'), 0)));
    expect(cell(s, 1, 1)).toMatchObject({ type: 'label', value: 'lost', align: 'left' });
    expect(msgs(s).join('|')).toMatch(/does not follow its formula/);
  });

  it('a formula cut short inside its record is kept as a null formula with a warning', () => {
    const body = [0, ...u16(0), ...u16(0), ...f64(7), ...u16(50), 0x05, 1, 0];
    const s = decode(file(rec(0x10, ...body)));
    expect(cell(s, 0, 0)).toMatchObject({ value: 7, formula: null });
    expect(msgs(s).join('|')).toMatch(/cut short/);
  });
});

describe('wk1 annotations', () => {
  it('one top-level group per record with name, address and fields', () => {
    const bytes = file(label(1, 2, "'Hi"), formula(5, 3, 1, [...compileFormula('1+2', 5, 3)]), rec(8, ...u16(2), 12));
    const s = decode(bytes);
    expect(s.annotations.map((a) => a.label)).toEqual(['BOF', 'LABEL B3', 'FORMULA F4', 'COLW1 C', 'EOF']);
    expect(coverage(s.annotations, bytes.length).exact).toBe(true);
    const f = s.annotations[2]!;
    expect(f.children?.map((c) => c.label)).toEqual(['type', 'length', 'format', 'col', 'row', 'value', 'formulaLength', 'formula']);
    expect(f.children?.find((c) => c.label === 'formula')?.value).toBe('1+2');
    expect(f.children?.find((c) => c.label === 'format')?.value).toBe('fixed, 0 decimals');
    expect(locate(s.annotations, f.start + 2).map((a) => a.label)).toEqual(['FORMULA F4', 'length']);
  });
});

describe('wk1 formatValue and dates', () => {
  const mk = (value: number | string | null, type: number, decimals: number, extra: Partial<SheetCell> = {}): SheetCell => ({
    col: 0, row: 0, type: typeof value === 'string' ? 'label' : 'number', value, format: { type, decimals, protected: false }, ...extra,
  });

  it('date serials: 60 is the phantom 29 Feb 1900, 61 is 1 Mar 1900', () => {
    expect(serialToIso(1)).toBe('1900-01-01');
    expect(serialToIso(59)).toBe('1900-02-28');
    expect(serialToIso(60)).toBe('1900-02-29');
    expect(serialToIso(61)).toBe('1900-03-01');
    expect(serialToIso(36526)).toBe('2000-01-01');
    expect(serialToIso(73050)).toBe('2099-12-31');
    expect(serialToIso(-1)).toBeNull();
    expect(serialToIso(73051)).toBeNull();
    expect(serialToIso(NaN)).toBeNull();
  });

  it('fixed, scientific, currency, percent, comma, general', () => {
    expect(formatValue(mk(1234.5678, 0, 2))).toBe('1234.57');
    expect(formatValue(mk(2.5, 0, 0))).toBe('3');
    expect(formatValue(mk(-2.5, 0, 0))).toBe('-3');
    expect(formatValue(mk(-0.001, 0, 2))).toBe('0.00');
    expect(formatValue(mk(1.005, 0, 2))).toBe('1.01');
    expect(formatValue(mk(12345.678, 1, 2))).toBe('1.23E+04');
    expect(formatValue(mk(0.00012, 1, 1))).toBe('1.2E-04');
    expect(formatValue(mk(0, 1, 2))).toBe('0.00E+00');
    expect(formatValue(mk(1234.5, 2, 2))).toBe('$1,234.50');
    expect(formatValue(mk(-1234.5, 2, 0))).toBe('($1,235)');
    expect(formatValue(mk(0.075, 3, 1))).toBe('7.5%');
    expect(formatValue(mk(1234567.891, 4, 1))).toBe('1,234,567.9');
    expect(formatValue(mk(-1234, 4, 0))).toBe('(1,234)');
    expect(formatValue(mk(3.14159265358979, 7, 1))).toBe('3.141592654');
    expect(formatValue(mk(100, 7, 1))).toBe('100');
    expect(formatValue(mk(12345678901, 7, 1))).toBe('1.23456789E+10');
    expect(formatValue(mk(NaN, 0, 2))).toBe('ERR');
  });

  it('special formats: dates, times, bar, text, hidden', () => {
    expect(formatValue(mk(36526, 7, 2))).toBe('1-Jan-00');
    expect(formatValue(mk(36526, 7, 3))).toBe('1-Jan');
    expect(formatValue(mk(36526, 7, 4))).toBe('Jan-00');
    expect(formatValue(mk(36526, 7, 9))).toBe('01/01/00');
    expect(formatValue(mk(36526, 7, 10))).toBe('01/01');
    expect(formatValue(mk(60, 7, 2))).toBe('29-Feb-00');
    expect(formatValue(mk(61, 7, 9))).toBe('03/01/00');
    expect(formatValue(mk(-5, 7, 2))).toBe('########');
    expect(formatValue(mk(0.5, 7, 7))).toBe('12:00:00 PM');
    expect(formatValue(mk(0.75 + 5 / 86400, 7, 7))).toBe('06:00:05 PM');
    expect(formatValue(mk(0, 7, 8))).toBe('12:00 AM');
    expect(formatValue(mk(0.999999, 7, 11))).toBe('00:00:00');
    expect(formatValue(mk(0.5208333333, 7, 12))).toBe('12:30');
    expect(formatValue(mk(3.2, 7, 0))).toBe('+++');
    expect(formatValue(mk(-2, 7, 0))).toBe('--');
    expect(formatValue(mk(0, 7, 0))).toBe('.');
    expect(formatValue(mk(5, 7, 6))).toBe('');
    expect(formatValue(mk(5, 7, 15))).toBe('5');
    const f = (text: string): SheetCell => mk(5, 7, 5, { type: 'formula', formula: text });
    expect(formatValue(f('B2*1.1'))).toBe('+B2*1.1');
    expect(formatValue(f('@SUM(A1..A2)'))).toBe('@SUM(A1..A2)');
  });

  it('labels and string results are shown as stored; blanks are empty', () => {
    expect(formatValue(mk('text', 2, 2))).toBe('text');
    expect(formatValue({ ...mk(null, 0, 0), type: 'blank' })).toBe('');
    expect(formatValue({ ...mk('abc', 0, 0), type: 'formula', formula: '@CHAR(65)' })).toBe('abc');
  });
});

describe('wk1 encode', () => {
  const fmt = { type: 0, decimals: 0, protected: false };
  const sheet = (cells: SheetCell[], more: Partial<SheetPayload> = {}): SheetPayload => ({
    kind: 'sheet', version: '2', columnWidths: {}, names: [], cells, ...more,
  });

  it('writes BOF 0x0406, then RANGE, COLW1, NAME, cells in row/column order, EOF', () => {
    const m = sheet(
      [
        { col: 1, row: 1, type: 'number', value: 1.5, format: fmt },
        { col: 0, row: 0, type: 'integer', value: 3, format: fmt },
      ],
      {
        range: { startCol: 0, startRow: 0, endCol: 1, endRow: 1 },
        columnWidths: { 3: 11, 0: 20 },
        names: [{ name: 'A_NAME', range: { startCol: 0, startRow: 0, endCol: 0, endRow: 0 } }],
      },
    );
    const b = encode(m);
    expect([...b.slice(0, 6)]).toEqual([0, 0, 2, 0, 6, 4]);
    const s = decode(b);
    expect(s.annotations.map((a) => a.label)).toEqual(['BOF', 'RANGE', 'COLW1 A', 'COLW1 D', 'NAME', 'INTEGER A1', 'NUMBER B2', 'EOF']);
    expect(s.warnings).toEqual([]);
    expect(s.payload).toEqual({ ...m, cells: [m.cells[1], m.cells[0]] });
    expect(wk1.detect(b)).toBeGreaterThanOrEqual(0.5);
  });

  it('round-trips a label, a numeric formula and a text formula', () => {
    const m = sheet([
      { col: 0, row: 0, type: 'label', value: 'caf\xe9', align: 'right', format: { type: 2, decimals: 2, protected: true } },
      { col: 1, row: 0, type: 'formula', value: 12.5, formula: '@SUM($A$1..B1)*1.1', format: fmt },
      { col: 2, row: 0, type: 'formula', value: 'ab', formula: '@CHAR(65)', format: fmt },
    ]);
    const s = decode(encode(m));
    expect(s.payload).toEqual(m);
    expect(s.annotations.map((a) => a.label)).toEqual(['BOF', 'LABEL A1', 'FORMULA B1', 'FORMULA C1', 'STRING C1', 'EOF']);
  });

  it('keeps -0 and extreme doubles', () => {
    const m = sheet([
      { col: 0, row: 0, type: 'number', value: -0, format: fmt },
      { col: 1, row: 0, type: 'number', value: Number.MAX_VALUE, format: fmt },
      { col: 2, row: 0, type: 'number', value: 5e-324, format: fmt },
    ]);
    expect(decode(encode(m)).payload).toEqual(m);
  });

  it('a formula without text is written as a plain cell with its cached value', () => {
    const m = sheet([
      { col: 0, row: 0, type: 'formula', value: 4, formula: null, format: fmt },
      { col: 1, row: 0, type: 'formula', value: 'x', formula: null, format: fmt },
      { col: 2, row: 0, type: 'formula', value: null, formula: null, format: fmt },
    ]);
    const cells = (decode(encode(m)).payload as SheetPayload).cells;
    expect(cells.map((c) => [c.type, c.value])).toEqual([['number', 4], ['label', 'x'], ['blank', null]]);
  });

  it('refuses invalid models with an ExhumeError', () => {
    const one = (c: Partial<SheetCell>): SheetPayload => sheet([{ col: 0, row: 0, type: 'number', value: 1, format: fmt, ...c }]);
    expect(() => encode(one({ col: 256 }))).toThrow(ExhumeError);
    expect(() => encode(one({ row: 8192 }))).toThrow(ExhumeError);
    expect(() => encode(one({ type: 'integer', value: 40000 }))).toThrow(ExhumeError);
    expect(() => encode(one({ type: 'integer', value: 1.5 }))).toThrow(ExhumeError);
    expect(() => encode(one({ value: NaN }))).toThrow(ExhumeError);
    expect(() => encode(one({ type: 'label', value: 'a\0b' }))).toThrow(ExhumeError);
    expect(() => encode(one({ type: 'label', value: '€' }))).toThrow(ExhumeError);
    expect(() => encode(one({ type: 'formula', value: 1, formula: '@NOPE(1)' }))).toThrow(ExhumeError);
    expect(() => encode(sheet([], { columnWidths: { 256: 1 } }))).toThrow(ExhumeError);
    expect(() => encode(sheet([], { columnWidths: { 1: 256 } }))).toThrow(ExhumeError);
    expect(() => encode(sheet([], { names: [{ name: 'x'.repeat(16), range: { startCol: 0, startRow: 0, endCol: 0, endRow: 0 } }] }))).toThrow(ExhumeError);
    expect(() => encode({ kind: 'table', fields: [], records: [], lastUpdate: '2000-01-01' })).toThrow(ExhumeError);
  });

  it('an empty sheet is BOF + EOF', () => {
    const b = encode(sheet([]));
    expect(b.length).toBe(10);
    const s = decode(b);
    expect(s.payload).toEqual(sheet([]));
    expect(s.warnings).toEqual([]);
  });
});

describe('wk1 detect', () => {
  it('recognises the three BOF versions and prefers a matching extension', () => {
    expect(wk1.detect(Uint8Array.from([0, 0, 2, 0, 6, 4]))).toBe(0.9);
    expect(wk1.detect(Uint8Array.from([0, 0, 2, 0, 4, 4]), 'a.WKS')).toBe(0.95);
    expect(wk1.detect(Uint8Array.from([0, 0, 2, 0, 5, 4]), 'a.txt')).toBe(0.9);
    expect(wk1.detect(Uint8Array.from([0, 0, 2, 0, 7, 4]))).toBe(0);
    expect(wk1.detect(Uint8Array.from([0, 0, 2, 0, 6]))).toBe(0);
    expect(wk1.detect(new Uint8Array(0), 'x.wk1')).toBe(0);
  });
});
