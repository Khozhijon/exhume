import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cp437 } from '../../core/codepage.js';
import { formatProperties } from '../../core/testing.js';
import type { TableField, TablePayload } from '../../core/types.js';
import { dbf } from './index.js';
import { encode } from './encode.js';
import { decode } from './decode.js';
import { daysInMonth, formatNumber, validateTable } from './model.js';

type Value = string | number | boolean | null;

const nameArb = fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 1, maxLength: 10 });

const fieldArb: fc.Arbitrary<TableField> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ name: nameArb, type: fc.constant<'C'>('C'), length: fc.oneof(fc.integer({ min: 1, max: 12 }), fc.constant(255)), decimals: fc.constant(0) }) },
  {
    weight: 3,
    arbitrary: fc.tuple(nameArb, fc.constantFrom<'N' | 'F'>('N', 'F'), fc.integer({ min: 1, max: 20 }), fc.nat(15)).map(([name, type, length, d]) => ({
      name, type, length, decimals: length < 3 ? 0 : Math.min(d, length - 2),
    })),
  },
  { weight: 1, arbitrary: nameArb.map((name) => ({ name, type: 'L' as const, length: 1, decimals: 0 })) },
  { weight: 1, arbitrary: nameArb.map((name) => ({ name, type: 'D' as const, length: 8, decimals: 0 })) },
  { weight: 1, arbitrary: nameArb.map((name) => ({ name, type: 'M' as const, length: 10, decimals: 0 })) },
);

const textArb = (max: number): fc.Arbitrary<string> =>
  fc.oneof(
    fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: max }),
    // exactly full width, last character not a space: the widest legal value
    fc.array(fc.integer({ min: 0, max: 255 }), { minLength: max, maxLength: max }).map((a) => [...a.slice(0, -1), (a[a.length - 1]! === 0x20 ? 0x41 : a[a.length - 1]!)]),
  ).map((codes) => codes.map((c) => cp437(c)).join('').replace(/ +$/, ''));

const numberArb = (f: TableField): fc.Arbitrary<number | null> => {
  const digits = Math.min(15, f.length - (f.decimals > 0 ? 1 : 0));
  const scale = 10 ** f.decimals;
  const max = 10 ** digits - 1;
  const fits = (n: number): boolean => formatNumber(n, f.length, f.decimals) !== null;
  return fc.oneof(
    fc.constant(null),
    fc.constant(0),
    fc.integer({ min: -max, max }).map((m) => m / scale).filter(fits),
    fc.constantFrom(max / scale, -max / scale).filter(fits), // widest values
    fc.integer({ min: -999, max: 999 }).map((m) => m / scale).filter(fits),
  );
};

const dateArb: fc.Arbitrary<string> = fc.tuple(fc.integer({ min: 1, max: 9999 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 })).map(([y, m, d]) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, daysInMonth(y, m))).padStart(2, '0')}`);

function valueArb(f: TableField): fc.Arbitrary<Value> {
  switch (f.type) {
    case 'C': return textArb(f.length);
    case 'N':
    case 'F': return numberArb(f);
    case 'L': return fc.constantFrom<Value>(true, false, null);
    case 'D': return fc.oneof(fc.constant(null), dateArb);
    default: return fc.constant(null);
  }
}

export const tableArb: fc.Arbitrary<TablePayload> = fc
  .tuple(
    fc.array(fieldArb, { minLength: 1, maxLength: 7 }),
    fc.integer({ min: 1900, max: 2155 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }),
  )
  .chain(([fields, y, m, d]) =>
    fc.record({
      kind: fc.constant<'table'>('table'),
      fields: fc.constant(fields),
      lastUpdate: fc.constant(`${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, daysInMonth(y, m))).padStart(2, '0')}`),
      // zero records included; deleted flags mixed
      records: fc.array(
        fc.record({ deleted: fc.boolean(), values: fc.tuple(...fields.map(valueArb)).map((v) => v as Value[]) }),
        { maxLength: 8 },
      ),
    }),
  );

describe('dbf model arbitrary', () => {
  it('generates only valid models', () => {
    fc.assert(fc.property(tableArb, (t) => { expect(validateTable(t)).toBeNull(); }), { numRuns: 200 });
  });
});

describe('dbf specific properties', () => {
  it('empty tables, deleted rows and max-width values are reachable and round-trip', () => {
    const t: TablePayload = {
      kind: 'table', lastUpdate: '2155-12-31',
      fields: [
        { name: 'C255', type: 'C', length: 255, decimals: 0 },
        { name: 'N20', type: 'N', length: 20, decimals: 2 },
        { name: 'F', type: 'F', length: 4, decimals: 1 },
      ],
      records: [
        { deleted: true, values: ['x'.repeat(254) + 'é', -99999999999999.99, -0.5] },
        { deleted: false, values: ['', null, null] },
      ],
    };
    expect(decode(encode(t)).payload).toEqual(t);
    const empty: TablePayload = { ...t, records: [] };
    expect(decode(encode(empty)).payload).toEqual(empty);
  });

  it('numbers keep exactly the stored text value', () => {
    fc.assert(
      fc.property(fc.integer({ min: -999999, max: 999999 }), fc.nat(4), (m, d) => {
        const v = m / 10 ** d;
        const f: TableField = { name: 'X', type: 'N', length: 12, decimals: d };
        const t: TablePayload = { kind: 'table', lastUpdate: '2000-01-01', fields: [f], records: [{ deleted: false, values: [v] }] };
        expect(decode(encode(t)).payload).toEqual(t);
      }),
    );
  });
});

formatProperties(dbf, {
  model: tableArb,
  runs: 60,
  hostile: [
    // a real header with garbage after it
    fc.tuple(tableArb, fc.uint8Array({ maxLength: 200 })).map(([t, noise]) => {
      const b = encode(t);
      return Uint8Array.from([...b.slice(0, 33 + 32 * t.fields.length), ...noise]);
    }),
  ],
});
