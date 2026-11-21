import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { coverage } from '../../core/annotations.js';
import { unpackBits } from '../../core/packbits.js';
import type { ImagePayload } from '../../core/types.js';
import { formatProperties } from '../../core/testing.js';
import { ilbm } from './index.js';

/**
 * Model rule that keeps P1 exact: the encoder writes nPlanes = bitsPerPixel (1, 4, 8 or 24) and the
 * decoder maps 1 -> 1, 2..4 -> 4, 5..8 -> 8, 24 / HAM6 -> 24, so those four widths survive. The palette
 * is written whole and read back at the CMAP's own length (1..2^bpp here); indices stay below 2^bpp
 * because only that many bits are stored.
 */
const colour = fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255)) as fc.Arbitrary<[number, number, number]>;

const indexed = fc
  .tuple(fc.constantFrom(1, 4, 8) as fc.Arbitrary<1 | 4 | 8>, fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 6 }))
  .chain(([bpp, width, height]) =>
    fc.record({
      kind: fc.constant('image' as const),
      width: fc.constant(width),
      height: fc.constant(height),
      bitsPerPixel: fc.constant(bpp),
      palette: fc.array(colour, { minLength: 1, maxLength: Math.min(1 << bpp, 64) }),
      pixels: fc.uint8Array({ minLength: width * height, maxLength: width * height }).map((a) => a.map((v) => v & ((1 << bpp) - 1))),
    }),
  );

const rgb = fc
  .tuple(fc.integer({ min: 1, max: 24 }), fc.integer({ min: 1, max: 4 }))
  .chain(([width, height]) =>
    fc.record({
      kind: fc.constant('image' as const),
      width: fc.constant(width),
      height: fc.constant(height),
      bitsPerPixel: fc.constant(24 as const),
      pixels: fc.uint8Array({ minLength: width * height * 3, maxLength: width * height * 3 }),
    }),
  );

const model: fc.Arbitrary<ImagePayload> = fc.oneof(indexed, rgb);

const header = (planes: number, comp: number): number[] => [
  ...[70, 79, 82, 77, 0, 0, 0, 200, 73, 76, 66, 77], // FORM, size, ILBM
  ...[66, 77, 72, 68, 0, 0, 0, 20, 0, 8, 0, 8, 0, 0, 0, 0, planes, 0, comp, 0, 0, 0, 1, 1, 0, 8, 0, 8],
];

formatProperties(ilbm, {
  model,
  runs: 60,
  hostile: [
    // a valid header followed by noise reaches CMAP / CAMG / BODY handling
    fc.tuple(fc.constantFrom(1, 2, 5, 6, 8, 24), fc.constantFrom(0, 1), fc.uint8Array({ maxLength: 400 })).map(([p, c, tail]) => new Uint8Array([...header(p, c), ...tail])),
  ],
});

describe('ilbm: slice-specific properties', () => {
  it('encoded BODY rows are ByteRun1 packed per plane row and unpack to the planar rows', () => {
    fc.assert(
      fc.property(indexed, (m) => {
        const bytes = ilbm.encode!(m);
        const s = ilbm.decode(bytes);
        const body = s.annotations.find((a) => a.label === 'chunk BODY')!;
        const rows = body.children!.filter((c) => c.label.startsWith('row'));
        expect(rows).toHaveLength(m.height);
        const rb = ((m.width + 15) >> 4) << 1;
        for (const row of rows) {
          const res = unpackBits(bytes.subarray(0, row.end), rb * m.bitsPerPixel, row.start);
          expect(res.complete).toBe(true);
          expect(res.consumed).toBe(row.end - row.start);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('every encoded file has top-level chunks FORM header, BMHD, [CMAP, CAMG], BODY and tiles exactly', () => {
    fc.assert(
      fc.property(model, (m) => {
        const bytes = ilbm.encode!(m);
        const s = ilbm.decode(bytes);
        expect(s.warnings).toEqual([]);
        expect(s.annotations[0]!.label).toBe('FORM header');
        expect(s.annotations.slice(1).every((a) => /^chunk [A-Z]{4}$/.test(a.label))).toBe(true);
        expect(coverage(s.annotations, bytes.length).exact).toBe(true);
      }),
      { numRuns: 40 },
    );
  });

  it('decoding is deterministic and never mutates its input', () => {
    fc.assert(
      fc.property(model, (m) => {
        const bytes = ilbm.encode!(m);
        const copy = bytes.slice();
        const a = ilbm.decode(bytes);
        const b = ilbm.decode(bytes);
        expect(bytes).toEqual(copy);
        expect(a.payload).toEqual(b.payload);
      }),
      { numRuns: 20 },
    );
  });
});
