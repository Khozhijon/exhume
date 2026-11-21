import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv, sheetToRows, tableToRows } from './csv.js';
import type { SheetCell, SheetPayload, TablePayload } from '../core/types.js';

describe('toCsv / parseCsv', () => {
  it('uses CRLF and quotes when needed', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'x\ny']])).toBe('a,"b,c","say ""hi""","x\ny"\r\n');
    expect(toCsv([])).toBe('');
  });
  it('writes a lone empty field as "" and reads it back', () => {
    expect(toCsv([[''], ['a']])).toBe('""\r\na\r\n');
    expect(parseCsv(toCsv([[''], ['']]))).toEqual([[''], ['']]);
  });
  it('parses LF, CR, missing final terminator and blank lines', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a\rb\r')).toEqual([['a'], ['b']]);
    expect(parseCsv('a\r\n\r\nb')).toEqual([['a'], [''], ['b']]);
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,')).toEqual([['a', '']]);
  });
});

const cell = (col: number, row: number, value: SheetCell['value'], type: SheetCell['type'] = 'label'): SheetCell => ({
  col, row, type, value, format: { type: 0, decimals: 0, protected: false },
});

describe('sheetToRows', () => {
  it('builds a dense grid to the last used cell', () => {
    const sheet: SheetPayload = {
      kind: 'sheet', version: '1A', columnWidths: {}, names: [],
      cells: [cell(0, 0, 'Name'), cell(2, 1, 4.5, 'number'), cell(5, 5, null, 'blank')],
    };
    expect(sheetToRows(sheet)).toEqual([['Name', '', ''], ['', '', '4.5']]);
  });
  it('is empty for an empty sheet', () => {
    expect(sheetToRows({ kind: 'sheet', version: '2', columnWidths: {}, names: [], cells: [] })).toEqual([]);
  });
});

describe('tableToRows', () => {
  const table: TablePayload = {
    kind: 'table', lastUpdate: '2000-01-01',
    fields: [{ name: 'NAME', type: 'C', length: 5, decimals: 0 }, { name: 'OK', type: 'L', length: 1, decimals: 0 }, { name: 'N', type: 'N', length: 3, decimals: 0 }],
    records: [
      { deleted: false, values: ['Ann', true, 3] },
      { deleted: true, values: ['Bob', false, null] },
    ],
  };
  it('skips deleted records by default', () => {
    expect(tableToRows(table)).toEqual([['NAME', 'OK', 'N'], ['Ann', 'TRUE', '3']]);
  });
  it('adds a DELETED column on request', () => {
    expect(tableToRows(table, { includeDeleted: true })).toEqual([
      ['DELETED', 'NAME', 'OK', 'N'], ['', 'Ann', 'TRUE', '3'], ['DELETED', 'Bob', 'FALSE', ''],
    ]);
  });
});
