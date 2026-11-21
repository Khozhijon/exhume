import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { toXlsx, escapeXml, columnName, lotusNumberFormat } from './xlsx.js';
import type { SheetCell, SheetPayload, TablePayload } from '../core/types.js';

const fmt = { type: 7, decimals: 15, protected: false }; // 1-2-3 "default" format: no Excel number format
const cell = (col: number, row: number, value: SheetCell['value'], type: SheetCell['type'], formula?: string): SheetCell => ({
  col, row, type, value, formula, format: fmt,
});

describe('helpers', () => {
  it('names columns beyond Z', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
  it('escapes and strips illegal characters', () => {
    expect(escapeXml('a<b>&"c"\u0001￾\uD800')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });
});

describe('toXlsx sheet', () => {
  const sheet: SheetPayload = {
    kind: 'sheet', version: '2', names: [], columnWidths: { 0: 20, 2: 8.5 },
    cells: [
      cell(0, 0, 'Total & <more>', 'label'),
      cell(1, 0, 7, 'integer'),
      cell(0, 1, 15, 'formula', '+B1*2+1'),
      cell(1, 1, 3, 'formula', '@WEIRD(B1)'),
      cell(2, 1, 9, 'formula', '@WEIRD(B1)'),
      cell(27, 2, 'far', 'label'),
      cell(5, 5, null, 'blank'),
    ],
  };
  const { bytes, warnings } = toXlsx(sheet, { translateFormula: (l) => (l.startsWith('@') ? null : `=${l.slice(1)}`) });
  const files = unzipSync(bytes);
  const xml = strFromU8(files['xl/worksheets/sheet1.xml'] as Uint8Array);

  it('contains all workbook parts', () => {
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
    ]);
    expect(strFromU8(files['xl/workbook.xml'] as Uint8Array)).toContain('<sheet name="Sheet1" sheetId="1" r:id="rId1"/>');
  });
  it('writes strings inline, numbers raw, wide column references', () => {
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Total &amp; &lt;more&gt;</t></is></c>');
    expect(xml).toContain('<c r="B1"><v>7</v></c>');
    expect(xml).toContain('<c r="AB3" t="inlineStr">');
    expect(xml).not.toContain('F6');
  });
  it('writes a translated formula with its cached value', () => {
    expect(xml).toContain('<c r="A2"><f>B1*2+1</f><v>15</v></c>');
  });
  it('falls back to cached values with one deduplicated warning', () => {
    expect(xml).toContain('<c r="B2"><v>3</v></c>');
    expect(xml).toContain('<c r="C2"><v>9</v></c>');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('@WEIRD(B1)');
  });
  it('writes column widths', () => {
    expect(xml).toContain('<col min="1" max="1" width="20" customWidth="1"/>');
    expect(xml).toContain('<col min="3" max="3" width="8.5" customWidth="1"/>');
  });
  it('warns for every formula when no translator is given', () => {
    expect(toXlsx(sheet).warnings).toHaveLength(2);
  });
});

describe('toXlsx table', () => {
  const table: TablePayload = {
    kind: 'table', lastUpdate: '2000-01-01',
    fields: [{ name: 'NAME', type: 'C', length: 5, decimals: 0 }, { name: 'OK', type: 'L', length: 1, decimals: 0 }, { name: 'DATE', type: 'D', length: 8, decimals: 0 }, { name: 'N', type: 'N', length: 3, decimals: 0 }],
    records: [
      { deleted: false, values: ['Ann', true, '1999-12-31', 3.5] },
      { deleted: true, values: ['Gone', false, null, 1] },
      { deleted: false, values: [null, false, null, null] },
    ],
  };
  const xml = strFromU8(unzipSync(toXlsx(table).bytes)['xl/worksheets/sheet1.xml'] as Uint8Array);
  it('writes header, values, booleans and dates as strings; skips deleted', () => {
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">NAME</t></is></c>');
    expect(xml).toContain('<c r="B2" t="b"><v>1</v></c>');
    expect(xml).toContain('>1999-12-31</t>');
    expect(xml).toContain('<c r="D2"><v>3.5</v></c>');
    expect(xml).not.toContain('Gone');
    expect(xml).toContain('<c r="B3" t="b"><v>0</v></c>');
    expect(xml).not.toContain('r="A3"');
  });
});

describe('xlsx number formats (reviewer addition)', () => {
  const fmt = { type: 2, decimals: 2, protected: false };
  const sheet: SheetPayload = {
    kind: 'sheet', version: '2', columnWidths: {}, names: [],
    cells: [
      { col: 0, row: 0, type: 'number', value: 1234.5, format: fmt },
      { col: 1, row: 0, type: 'integer', value: 32081, format: { type: 7, decimals: 2, protected: false } },
      { col: 2, row: 0, type: 'number', value: 0.25, format: { type: 3, decimals: 1, protected: false } },
      { col: 3, row: 0, type: 'number', value: 7, format: { type: 7, decimals: 15, protected: false } },
      { col: 4, row: 0, type: 'label', value: 'text', align: 'left', format: fmt },
    ],
  };
  it('maps 1-2-3 formats to Excel format codes', () => {
    expect(lotusNumberFormat({ type: 2, decimals: 2 })).toBe('"$"#,##0.00;("$"#,##0.00)');
    expect(lotusNumberFormat({ type: 0, decimals: 0 })).toBe('0');
    expect(lotusNumberFormat({ type: 3, decimals: 1 })).toBe('0.0%');
    expect(lotusNumberFormat({ type: 7, decimals: 2 })).toBe('d-mmm-yy');
    expect(lotusNumberFormat({ type: 7, decimals: 1 })).toBeNull();
    expect(lotusNumberFormat({ type: 7, decimals: 15 })).toBeNull();
  });
  it('writes one style per distinct format and points number cells at it', () => {
    const files = unzipSync(toXlsx(sheet).bytes);
    const styles = strFromU8(files['xl/styles.xml']!);
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(styles).toContain('<numFmts count="3">');
    expect(styles).toContain('formatCode="d-mmm-yy"');
    expect(styles).toContain('<cellXfs count="4">');
    expect(xml).toContain('<c r="A1" s="1"><v>1234.5</v></c>');
    expect(xml).toContain('<c r="B1" s="2"><v>32081</v></c>');
    expect(xml).toContain('<c r="C1" s="3"><v>0.25</v></c>');
    expect(xml).toContain('<c r="D1"><v>7</v></c>');
    expect(xml).toContain('<c r="E1" t="inlineStr">');
  });
});
