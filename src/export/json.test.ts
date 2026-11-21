import { describe, it, expect } from 'vitest';
import { toJson, autopsyToJson, toBase64 } from './json.js';
import type { Specimen, SheetCell } from '../core/types.js';

describe('toBase64', () => {
  it('matches known vectors', () => {
    const e = (s: string) => toBase64(new TextEncoder().encode(s));
    expect([e(''), e('f'), e('fo'), e('foo'), e('foob')]).toEqual(['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==']);
  });
});

describe('toJson', () => {
  it('encodes images with base64 pixels and keeps the size', () => {
    const j = JSON.parse(toJson({ kind: 'image', width: 2, height: 1, bitsPerPixel: 8, palette: [[0, 0, 0]], pixels: Uint8Array.from([1, 2]) }));
    expect(j).toMatchObject({ kind: 'image', width: 2, height: 1, bitsPerPixel: 8, pixels: 'AQI=', palette: [[0, 0, 0]] });
  });
  it('encodes sheets as rows keyed by column letter', () => {
    const c = (col: number, row: number, value: SheetCell['value']): SheetCell => ({ col, row, value, type: 'label', format: { type: 0, decimals: 0, protected: false } });
    const j = JSON.parse(toJson({ kind: 'sheet', version: '1A', columnWidths: {}, names: [], cells: [c(0, 0, 'Name'), c(1, 0, 42), c(26, 2, 'x')] }));
    expect(j).toEqual([{ A: 'Name', B: 42 }, {}, { AA: 'x' }]);
  });
  it('encodes tables keyed by field name and flags deleted records', () => {
    const j = JSON.parse(toJson({
      kind: 'table', lastUpdate: '2000-01-01',
      fields: [{ name: 'NAME', type: 'C', length: 3, decimals: 0 }, { name: 'WHEN', type: 'D', length: 8, decimals: 0 }],
      records: [{ deleted: false, values: ['Ann', '1999-12-31'] }, { deleted: true, values: ['Bob', null] }],
    }));
    expect(j).toEqual([{ NAME: 'Ann', WHEN: '1999-12-31' }, { NAME: 'Bob', WHEN: null, _deleted: true }]);
  });
  it('passes documents through', () => {
    const j = JSON.parse(toJson({ kind: 'document', blocks: [{ type: 'pageBreak' }], header: 'h' }));
    expect(j).toEqual({ kind: 'document', blocks: [{ type: 'pageBreak' }], header: 'h' });
  });
});

describe('autopsyToJson', () => {
  const s: Specimen = {
    payload: { kind: 'document', blocks: [] },
    annotations: [{ label: 'Header', start: 0, end: 4, value: 'x' }],
    warnings: [{ message: 'odd', offset: 3 }],
    meta: { blockCount: 0 },
  };
  it('lists annotations, warnings and meta', () => {
    expect(JSON.parse(autopsyToJson(s, 'a.ws'))).toEqual({ fileName: 'a.ws', kind: 'document', meta: { blockCount: 0 }, warnings: s.warnings, annotations: s.annotations });
    expect(JSON.parse(autopsyToJson(s))).not.toHaveProperty('fileName');
  });
});
