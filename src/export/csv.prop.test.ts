import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { toCsv, parseCsv } from './csv.js';

const field = fc.string({ unit: fc.constantFrom('a', 'Z', ' ', ',', '"', '\r', '\n', '\t', 'é', '\u{1F600}', '1'), maxLength: 8 });
const grid = fc.array(fc.array(field, { minLength: 1, maxLength: 5 }), { maxLength: 8 });
const wild = fc.array(
  fc.array(fc.string({ unit: 'binary', maxLength: 6 }).map((s) => s.replace(/\0/g, '')), { minLength: 1, maxLength: 4 }),
  { maxLength: 5 },
);

describe('Property 7: CSV round trip', () => {
  it('parseCsv(toCsv(rows)) deep-equals rows', () => {
    fc.assert(
      fc.property(grid, (rows) => {
        expect(parseCsv(toCsv(rows))).toEqual(rows);
      }),
      { numRuns: 500 },
    );
  });
  it('holds for fully arbitrary strings too', () => {
    fc.assert(
      fc.property(wild, (rows) => {
        expect(parseCsv(toCsv(rows))).toEqual(rows);
      }),
    );
  });
});
