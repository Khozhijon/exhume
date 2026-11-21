import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { formatProperties } from '../../core/testing.js';
import type { ImagePayload } from '../../core/types.js';
import { decode } from "./decode.js";
import { macpaint } from './index.js';

const W = 576;
const H = 720;

/** A row template: either random bits or alternating runs of white/black. */
const rowTemplate: fc.Arbitrary<Uint8Array> = fc.oneof(
  fc.uint8Array({ minLength: 72, maxLength: 72 }).map((bytes) => {
    const row = new Uint8Array(W);
    for (let x = 0; x < W; x++) row[x] = (bytes[x >> 3]! >> (7 - (x & 7))) & 1;
    return row;
  }),
  fc.array(fc.tuple(fc.integer({ min: 0, max: 1 }), fc.integer({ min: 1, max: 300 })), { minLength: 1, maxLength: 12 }).map((runs) => {
    const row = new Uint8Array(W);
    let x = 0;
    for (const [v, n] of runs) for (let k = 0; k < n && x < W; k++) row[x++] = v;
    return row;
  }),
  fc.constantFrom(0, 1).map((v) => new Uint8Array(W).fill(v)),
);

const pixelsArb: fc.Arbitrary<Uint8Array> = fc
  .tuple(
    fc.array(rowTemplate, { minLength: 1, maxLength: 6 }),
    fc.array(fc.nat(), { minLength: H, maxLength: H }),
  )
  .map(([templates, picks]) => {
    const px = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) px.set(templates[picks[y]! % templates.length]!, y * W);
    return px;
  });

const model: fc.Arbitrary<ImagePayload> = fc
  .tuple(pixelsArb, fc.array(fc.uint8Array({ minLength: 8, maxLength: 8 }), { minLength: 38, maxLength: 38 }))
  .map(([pixels, patterns]) => ({
    kind: 'image' as const,
    width: W,
    height: H,
    bitsPerPixel: 1 as const,
    palette: [[255, 255, 255], [0, 0, 0]] as [number, number, number][],
    pixels,
    patterns,
  }));

formatProperties(macpaint, {
  model,
  runs: 12,
  fuzzRuns: 150,
  hostile: [
    fc.uint8Array({ maxLength: 3000 }).map((tail) => {
      const out = new Uint8Array(512 + tail.length);
      out[3] = 2;
      out.set(tail, 512);
      return out;
    }),
  ],
});

describe('macpaint: extra properties', () => {
  it('decoding never produces pixels other than 0 or 1 and always 576*720', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 3000 }), (tail) => {
        const f = new Uint8Array(512 + tail.length);
        f[3] = 2;
        f.set(tail, 512);
        const p = decode(f).payload as ImagePayload;
        expect(p.pixels.length).toBe(W * H);
        expect(p.pixels.every((v) => v === 0 || v === 1)).toBe(true);
      }),
      { numRuns: 60 },
    );
  });
});
