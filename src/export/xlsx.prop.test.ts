import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { unzipSync, strFromU8 } from 'fflate';
import { toXlsx, escapeXml, cellRef } from './xlsx.js';
import type { SheetCell, SheetPayload, TablePayload } from '../core/types.js';

const text = fc.string({ unit: fc.constantFrom('a', 'Q', ' ', '<', '>', '&', '"', "'", '\n', 'é', '\u0001', '9'), maxLength: 10 });
const fmt = { type: 0, decimals: 0, protected: false };

const sheetArb = fc
  .array(
    fc.record({
      col: fc.integer({ min: 0, max: 800 }),
      row: fc.integer({ min: 0, max: 200 }),
      v: fc.oneof(text.filter((s) => s !== ''), fc.integer({ min: -1000, max: 1000 })),
    }),
    { maxLength: 40 },
  )
  .map((cs): SheetPayload => {
    const seen = new Map<string, SheetCell>();
    for (const c of cs) {
      seen.set(`${c.col},${c.row}`, {
        col: c.col, row: c.row, format: fmt, value: c.v, type: typeof c.v === 'number' ? 'integer' : 'label',
      });
    }
    return { kind: 'sheet', version: '1A', columnWidths: {}, names: [], cells: [...seen.values()] };
  });

const tableArb = fc
  .record({
    names: fc.array(text.filter((s) => s !== ''), { minLength: 1, maxLength: 6 }),
    recs: fc.array(fc.array(fc.oneof(text.filter((s) => s !== ''), fc.integer({ min: 0, max: 99 }), fc.boolean(), fc.constant(null)), { minLength: 6, maxLength: 6 }), { maxLength: 15 }),
  })
  .map(({ names, recs }): TablePayload => ({
    kind: 'table', lastUpdate: '2000-01-01',
    fields: names.map((name) => ({ name, type: 'C' as const, length: 10, decimals: 0 })),
    records: recs.map((values) => ({ deleted: false, values })),
  }));

function check(payload: SheetPayload | TablePayload): void {
  const files = unzipSync(toXlsx(payload).bytes);
  const xml = strFromU8(files['xl/worksheets/sheet1.xml'] as Uint8Array);
  const refs = [...xml.matchAll(/<c r="([A-Z]+)(\d+)"/g)].map((m) => m[0]);
  expect(new Set(refs).size).toBe(refs.length);
  if (payload.kind === 'sheet') {
    for (const c of payload.cells) {
      const ref = cellRef(c.col, c.row);
      expect(xml.split(`<c r="${ref}"`).length - 1).toBe(1);
      if (typeof c.value === 'string') expect(xml).toContain(escapeXml(c.value));
      else expect(xml).toContain(`<c r="${ref}"><v>${c.value}</v></c>`);
    }
  } else {
    payload.fields.forEach((f, col) => {
      expect(xml.split(`<c r="${cellRef(col, 0)}"`).length - 1).toBe(1);
      expect(xml).toContain(escapeXml(f.name));
    });
    payload.records.forEach((rec, i) =>
      payload.fields.forEach((_, col) => {
        const v = rec.values[col];
        const n = xml.split(`<c r="${cellRef(col, i + 1)}"`).length - 1;
        expect(n).toBe(v === null || v === undefined ? 0 : 1);
        if (typeof v === 'string') expect(xml).toContain(escapeXml(v));
      }),
    );
  }
}

describe('Property 9: XLSX is a valid ZIP containing every cell', () => {
  it('sheets', () => {
    fc.assert(fc.property(sheetArb, (p) => { check(p); }), { numRuns: 100 });
  });
  it('tables', () => {
    fc.assert(fc.property(tableArb, (p) => { check(p); }), { numRuns: 100 });
  });
});
