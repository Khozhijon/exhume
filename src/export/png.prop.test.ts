import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encodePng } from './png.js';
import { decodePngInTest } from './png-decoder.testutil.js';
import type { ImagePayload } from '../core/types.js';

const rgb = fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255));

const indexed = fc
  .record({
    bpp: fc.constantFrom(1 as const, 4 as const, 8 as const),
    width: fc.integer({ min: 1, max: 20 }),
    height: fc.integer({ min: 1, max: 8 }),
    colours: fc.integer({ min: 2, max: 16 }),
    palette: fc.array(rgb, { minLength: 16, maxLength: 16 }),
    seed: fc.array(fc.nat(255), { minLength: 160, maxLength: 160 }),
  })
  .map(({ bpp, width, height, colours, palette, seed }): ImagePayload => {
    const n = bpp === 1 ? 2 : colours;
    return {
      kind: 'image', width, height, bitsPerPixel: bpp,
      palette: palette.slice(0, n) as [number, number, number][],
      pixels: Uint8Array.from({ length: width * height }, (_, i) => (seed[i] ?? 0) % n),
    };
  });

const truecolour = fc
  .record({ width: fc.integer({ min: 1, max: 12 }), height: fc.integer({ min: 1, max: 6 }), seed: fc.array(fc.nat(255), { minLength: 216, maxLength: 216 }) })
  .map(({ width, height, seed }): ImagePayload => ({
    kind: 'image', width, height, bitsPerPixel: 24,
    pixels: Uint8Array.from({ length: width * height * 3 }, (_, i) => seed[i] ?? 0),
  }));

describe('PNG round trip', () => {
  it('reproduces pixels and palette for arbitrary small images', () => {
    fc.assert(
      fc.property(fc.oneof(indexed, truecolour), (img) => {
        const d = decodePngInTest(encodePng(img));
        expect([d.width, d.height]).toEqual([img.width, img.height]);
        expect(d.pixels).toEqual(img.pixels);
        if (img.palette) expect(d.palette).toEqual(img.palette);
      }),
      { numRuns: 200 },
    );
  });
});
