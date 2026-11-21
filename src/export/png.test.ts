import { describe, it, expect } from 'vitest';
import { encodePng, crc32 } from './png.js';
import { decodePngInTest } from './png-decoder.testutil.js';
import type { ImagePayload } from '../core/types.js';

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('encodePng', () => {
  it('writes a 1-bit palette PNG', () => {
    const img: ImagePayload = { kind: 'image', width: 10, height: 2, bitsPerPixel: 1, pixels: Uint8Array.from([1,0,1,0,1,0,1,0,1,1, 0,0,0,0,0,0,0,0,0,1]) };
    const png = encodePng(img);
    const d = decodePngInTest(png);
    expect(d.chunks).toEqual(['IHDR', 'PLTE', 'IDAT', 'IEND']);
    expect([d.width, d.height, d.bitDepth, d.colorType]).toEqual([10, 2, 1, 3]);
    expect(d.palette).toEqual([[255, 255, 255], [0, 0, 0]]);
    expect(d.pixels).toEqual(img.pixels);
  });
  it('writes 4 bpp as 8-bit indexed with the given palette', () => {
    const palette: [number, number, number][] = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    const img: ImagePayload = { kind: 'image', width: 3, height: 2, bitsPerPixel: 4, palette, pixels: Uint8Array.from([0, 1, 2, 2, 1, 0]) };
    const d = decodePngInTest(encodePng(img));
    expect([d.bitDepth, d.colorType]).toEqual([8, 3]);
    expect(d.palette).toEqual(palette);
    expect(d.pixels).toEqual(img.pixels);
  });
  it('writes 8 bpp without a palette as a grey ramp', () => {
    const img: ImagePayload = { kind: 'image', width: 2, height: 1, bitsPerPixel: 8, pixels: Uint8Array.from([0, 255]) };
    const d = decodePngInTest(encodePng(img));
    expect(d.palette.length).toBe(256);
    expect(d.palette[255]).toEqual([255, 255, 255]);
  });
  it('writes 24 bpp as truecolour without PLTE', () => {
    const img: ImagePayload = { kind: 'image', width: 2, height: 1, bitsPerPixel: 24, pixels: Uint8Array.from([10, 20, 30, 40, 50, 60]) };
    const d = decodePngInTest(encodePng(img));
    expect(d.chunks).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect([d.bitDepth, d.colorType]).toEqual([8, 2]);
    expect(d.pixels).toEqual(img.pixels);
  });
  it('rejects an empty image', () => {
    expect(() => encodePng({ kind: 'image', width: 0, height: 1, bitsPerPixel: 8, pixels: new Uint8Array(0) })).toThrow(RangeError);
  });
});
