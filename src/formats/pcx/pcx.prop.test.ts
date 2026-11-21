import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatProperties } from '../../core/testing.js';
import type { ImagePayload } from '../../core/types.js';
import { decode } from './decode.js';
import { pcx } from './index.js';
import { rleDecode, rleEncode } from './rle.js';

type RGB = [number, number, number];
const rgb: fc.Arbitrary<RGB> = fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255));

/** Pixel bytes biased toward runs (and bytes >= 0xC0) so both RLE paths are hit. */
function samples(n: number, max: number): fc.Arbitrary<Uint8Array> {
  return fc
    .array(fc.tuple(fc.nat(max), fc.integer({ min: 1, max: 20 })), { minLength: 1, maxLength: 40 })
    .map((runs) => {
      const out = new Uint8Array(n);
      let i = 0;
      for (const [v, len] of runs) for (let k = 0; k < len && i < n; k++) out[i++] = v;
      return out;
    });
}

const dims = fc.record({ width: fc.integer({ min: 1, max: 70 }), height: fc.integer({ min: 1, max: 12 }) });

const mono = dims.chain(({ width, height }) =>
  fc.record({
    kind: fc.constant('image' as const), width: fc.constant(width), height: fc.constant(height), bitsPerPixel: fc.constant(1 as const),
    palette: fc.tuple(rgb, rgb).filter(([a, b]) => a.join() !== b.join()).map((p) => p as RGB[]),
    pixels: samples(width * height, 1),
  }),
);
const ega = dims.chain(({ width, height }) =>
  fc.record({
    kind: fc.constant('image' as const), width: fc.constant(width), height: fc.constant(height), bitsPerPixel: fc.constant(4 as const),
    palette: fc.array(rgb, { minLength: 16, maxLength: 16 }),
    pixels: samples(width * height, 15),
  }),
);
const vga = dims.chain(({ width, height }) =>
  fc.record({
    kind: fc.constant('image' as const), width: fc.constant(width), height: fc.constant(height), bitsPerPixel: fc.constant(8 as const),
    palette: fc.array(rgb, { minLength: 256, maxLength: 256 }),
    pixels: samples(width * height, 255),
  }),
);
const truecolor = dims.chain(({ width, height }) =>
  fc.record({
    kind: fc.constant('image' as const), width: fc.constant(width), height: fc.constant(height), bitsPerPixel: fc.constant(24 as const),
    pixels: samples(width * height * 3, 255),
  }),
);
const model: fc.Arbitrary<ImagePayload> = fc.oneof(mono, ega, vga, truecolor);

const header = fc.uint8Array({ minLength: 128, maxLength: 128 }).map((h) => {
  h[0] = 0x0a;
  h[3] = [1, 2, 4, 8][h[3]! % 4]!;
  h[65] = [1, 3, 4][h[65]! % 3]!;
  h[8] = h[9] = h[10] = h[11] = 0; // xMin..yMin zero
  h[4] = h[5] = h[6] = h[7] = 0;
  h[8] = 1 + (h[12]! % 60);
  h[10] = 1 + (h[13]! % 20);
  return h;
});

formatProperties(pcx, {
  model,
  runs: 60,
  fuzzRuns: 300,
  hostile: [fc.tuple(header, fc.uint8Array({ maxLength: 1500 })).map(([h, t]) => {
    const out = new Uint8Array(128 + t.length);
    out.set(h);
    out.set(t, 128);
    return out;
  })],
});

describe('pcx: Property 6, RLE round trip', () => {
  it('rleDecode(rleEncode(bytes)) = bytes for arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) => {
        const enc = rleEncode(bytes);
        const r = rleDecode(enc, 0, enc.length, bytes.length, Math.max(1, bytes.length));
        expect(r.complete || bytes.length === 0).toBe(true);
        expect(r.out).toEqual(bytes);
        expect(r.end).toBe(enc.length);
      }),
      { numRuns: 300 },
    );
  });

  it('also holds with run-heavy bytes and a scanline size (runs break at line ends)', () => {
    fc.assert(
      fc.property(samples(500, 255), fc.integer({ min: 1, max: 60 }), (bytes, line) => {
        const enc = rleEncode(bytes, line);
        const r = rleDecode(enc, 0, enc.length, bytes.length, line);
        expect(r.out).toEqual(bytes);
        expect(r.lineEnds.length).toBe(Math.ceil(bytes.length / line));
      }),
      { numRuns: 200 },
    );
  });

  it('every encoded byte pair respects the format: no literal >= 0xC0, runs <= 63', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), (bytes) => {
        const enc = rleEncode(bytes);
        for (let i = 0; i < enc.length; ) {
          if ((enc[i]! & 0xc0) === 0xc0) {
            expect(enc[i]! & 0x3f).toBeGreaterThan(0);
            i += 2;
          } else i++;
        }
      }),
    );
  });
});

describe('pcx: decode extras', () => {
  it('pixel arrays have the size of the layout and indexes stay in range', () => {
    fc.assert(
      fc.property(header, fc.uint8Array({ maxLength: 800 }), (h, t) => {
        const f = new Uint8Array(128 + t.length);
        f.set(h);
        f.set(t, 128);
        let s;
        try {
          s = decode(f);
        } catch (e) {
          return;
        }
        const p = s.payload as ImagePayload;
        expect(p.pixels.length).toBe(p.width * p.height * (p.bitsPerPixel === 24 ? 3 : 1));
        if (p.palette && p.bitsPerPixel !== 24) {
          for (const v of p.pixels) expect(v).toBeLessThan(Math.max(p.palette.length, 1 << (p.bitsPerPixel === 8 ? 8 : 4)));
        }
      }),
      { numRuns: 150 },
    );
  });
});
