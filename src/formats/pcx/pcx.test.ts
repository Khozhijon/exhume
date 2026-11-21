import { describe, expect, it } from 'vitest';
import { coverage } from '../../core/annotations.js';
import { ExhumeError } from '../../core/types.js';
import type { ImagePayload } from '../../core/types.js';
import { decode } from './decode.js';
import { encode } from './encode.js';
import { pcx } from './index.js';
import { rleDecode, rleEncode } from './rle.js';

interface H {
  version?: number;
  encoding?: number;
  bpp: number;
  planes: number;
  width: number;
  height: number;
  bpl: number;
  ega?: number[];
}

/** Hand-built header, so decoder tests do not depend on our encoder. */
function header(o: H): Uint8Array {
  const b = new Uint8Array(128);
  b[0] = 0x0a;
  b[1] = o.version ?? 5;
  b[2] = o.encoding ?? 1;
  b[3] = o.bpp;
  b[8] = (o.width - 1) & 255;
  b[9] = (o.width - 1) >> 8;
  b[10] = (o.height - 1) & 255;
  b[11] = (o.height - 1) >> 8;
  if (o.ega) b.set(o.ega, 16);
  b[65] = o.planes;
  b[66] = o.bpl & 255;
  b[67] = o.bpl >> 8;
  b[68] = 1;
  return b;
}
function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
const u8 = (...v: number[]): Uint8Array => new Uint8Array(v);
const px = (s: ReturnType<typeof decode>): ImagePayload => s.payload as ImagePayload;

describe('pcx rle', () => {
  it('writes literals >= 0xC0 as a run of 1 and caps runs at 63', () => {
    expect(Array.from(rleEncode(u8(0xc5)))).toEqual([0xc1, 0xc5]);
    expect(Array.from(rleEncode(u8(0x05)))).toEqual([0x05]);
    expect(Array.from(rleEncode(new Uint8Array(64).fill(7)))).toEqual([0xff, 7, 7]);
    expect(Array.from(rleEncode(new Uint8Array(3).fill(7)))).toEqual([0xc3, 7]);
  });
  it('breaks runs at scanline ends', () => {
    expect(Array.from(rleEncode(new Uint8Array(4).fill(9), 2))).toEqual([0xc2, 9, 0xc2, 9]);
  });
  it('decodes runs across a line boundary as one stream', () => {
    const r = rleDecode(u8(0xc6, 5), 0, 2, 6, 4);
    expect(Array.from(r.out)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(r.lineEnds).toEqual([2, 2]); // the run completes line 0 and, being cut at maxOut, the partial line 1
    expect(r.complete).toBe(true);
  });
  it('stops at a dangling run header', () => {
    const r = rleDecode(u8(1, 0xc3), 0, 2, 4, 4);
    expect(r.complete).toBe(false);
    expect(r.produced).toBe(1);
  });
});

describe('pcx decode: layouts', () => {
  it('8bpp with a VGA palette trailer', () => {
    const pal = new Uint8Array(768);
    pal.set([10, 20, 30], 3); // entry 1
    const file = cat(header({ bpp: 8, planes: 1, width: 3, height: 2, bpl: 4 }), u8(0xc4, 1, 0xc4, 0), u8(0x0c), pal);
    const s = decode(file);
    expect(s.warnings).toEqual([]);
    const p = px(s);
    expect(Array.from(p.pixels)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(p.palette).toHaveLength(256);
    expect(p.palette![1]).toEqual([10, 20, 30]);
    expect(s.annotations.map((a) => a.label)).toEqual(['header', 'pixelData', 'vgaPalette']);
    expect(coverage(s.annotations, file.length).exact).toBe(true);
    expect(pcx.detect(file)).toBe(0.85);
  });

  it('8bpp with no palette falls back to greyscale and warns', () => {
    const file = cat(header({ bpp: 8, planes: 1, width: 2, height: 1, bpl: 2 }), u8(7, 9));
    const s = decode(file);
    expect(s.warnings.some((w) => /palette/i.test(w.message))).toBe(true);
    expect(px(s).palette![200]).toEqual([200, 200, 200]);
    expect(Array.from(px(s).pixels)).toEqual([7, 9]);
  });

  it('an RLE run crossing a scanline boundary', () => {
    // 2 scanlines of 2 bytes (width 2, 8bpp): one run of 4 covers both lines
    const file = cat(header({ bpp: 8, planes: 1, width: 2, height: 2, bpl: 2, version: 3 }), u8(0xc4, 0x42));
    const s = decode(file);
    expect(Array.from(px(s).pixels)).toEqual([0x42, 0x42, 0x42, 0x42]);
    expect(s.warnings.every((w) => !/ended/.test(w.message))).toBe(true);
  });

  it('1bpp monochrome: 0 is black, 1 is white by default', () => {
    const file = cat(header({ bpp: 1, planes: 1, width: 10, height: 1, bpl: 2 }), u8(0xc1, 0xaa, 0x40));
    const s = decode(file);
    expect(Array.from(px(s).pixels)).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 0, 1]);
    expect(px(s).palette).toEqual([[0, 0, 0], [255, 255, 255]]);
  });

  it('1bpp monochrome uses header palette entries 0 and 1 when they differ', () => {
    const file = cat(header({ bpp: 1, planes: 1, width: 8, height: 1, bpl: 2, ega: [255, 0, 0, 0, 0, 255] }), u8(0x80, 0));
    expect(px(decode(file)).palette).toEqual([[255, 0, 0], [0, 0, 255]]);
  });

  it('EGA planar 1bpp x 4 planes, plane 0 is the least significant bit', () => {
    const ega = Array.from({ length: 48 }, (_, i) => i);
    // width 2, one line: planes p0..p3 each one byte (bpl 2): pixel 0 = planes 0,2 -> 5; pixel 1 = planes 1,3 -> 10
    const data = u8(0x80, 0, 0x40, 0, 0x80, 0, 0x40, 0);
    const file = cat(header({ bpp: 1, planes: 4, width: 2, height: 1, bpl: 2, ega, version: 2 }), data);
    const s = decode(file);
    expect(Array.from(px(s).pixels)).toEqual([5, 10]);
    expect(px(s).bitsPerPixel).toBe(4);
    expect(px(s).palette).toHaveLength(16);
    expect(px(s).palette![5]).toEqual([15, 16, 17]);
  });

  it('4bpp packed, high nibble first (decode-only fixture)', () => {
    const ega = Array.from({ length: 48 }, (_, i) => 255 - i);
    const file = cat(header({ bpp: 4, planes: 1, width: 3, height: 2, bpl: 2, ega, version: 2 }), u8(0x12, 0x30, 0x70, 0xa0));
    const s = decode(file);
    expect(s.warnings).toEqual([]);
    expect(Array.from(px(s).pixels)).toEqual([1, 2, 3, 7, 0, 10]);
    expect(px(s).bitsPerPixel).toBe(4);
    expect(px(s).palette).toHaveLength(16);
    expect(px(s).palette![1]).toEqual([252, 251, 250]);
  });

  it('2bpp CGA gets the fixed palette and a warning (decode-only fixture)', () => {
    // width 5 -> 2 bytes per line min; pixels 0,1,2,3,1
    const file = cat(header({ bpp: 2, planes: 1, width: 5, height: 1, bpl: 2, version: 3 }), u8(0x1b, 0x40));
    const s = decode(file);
    expect(Array.from(px(s).pixels)).toEqual([0, 1, 2, 3, 1]);
    expect(px(s).palette).toEqual([[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]]);
    expect(s.warnings.some((w) => /CGA/.test(w.message))).toBe(true);
  });

  it('24-bit RGB planes', () => {
    const file = cat(header({ bpp: 8, planes: 3, width: 2, height: 1, bpl: 2 }), u8(1, 2, 3, 4, 5, 6));
    const p = px(decode(file));
    expect(p.bitsPerPixel).toBe(24);
    expect(p.palette).toBeUndefined();
    expect(Array.from(p.pixels)).toEqual([1, 3, 5, 2, 4, 6]);
  });

  it('uncompressed (encoding 0) decodes and warns', () => {
    const file = cat(header({ bpp: 8, planes: 1, width: 2, height: 2, bpl: 2, encoding: 0, version: 3 }), u8(0xc1, 0xc2, 3, 4));
    const s = decode(file);
    expect(Array.from(px(s).pixels)).toEqual([0xc1, 0xc2, 3, 4]); // bytes >= 0xC0 are literal here
    expect(s.warnings.some((w) => /uncompressed/.test(w.message))).toBe(true);
    expect(s.annotations.map((a) => a.label)).toEqual(['header', 'pixelData']);
  });

  it('truncated pixel data keeps what it has and warns', () => {
    const file = cat(header({ bpp: 8, planes: 1, width: 2, height: 3, bpl: 2, version: 3 }), u8(1, 2, 3, 4));
    const s = decode(file);
    expect(s.warnings.some((w) => /ended/.test(w.message))).toBe(true);
    expect(Array.from(px(s).pixels)).toEqual([1, 2, 3, 4, 0, 0]);
  });

  it('warns about unknown version and a too small bytesPerLine', () => {
    const file = cat(header({ bpp: 8, planes: 1, width: 4, height: 1, bpl: 2, version: 9 }), u8(1, 2, 3, 4));
    const s = decode(file);
    expect(s.warnings.length).toBeGreaterThanOrEqual(2);
    expect(Array.from(px(s).pixels)).toEqual([1, 2, 3, 4]);
  });
});

describe('pcx decode: errors', () => {
  it('rejects a wrong manufacturer byte and short files', () => {
    expect(() => decode(u8(1, 2, 3))).toThrow(new ExhumeError('not a PCX file'));
    expect(() => decode(new Uint8Array(0))).toThrow(ExhumeError);
    expect(() => decode(u8(0x0a, 5))).toThrow(ExhumeError);
  });
  it('rejects unsupported layouts', () => {
    for (const [bpp, planes] of [[8, 4], [4, 3], [2, 3], [1, 2], [3, 1], [8, 2]] as const) {
      const f = cat(header({ bpp, planes, width: 4, height: 1, bpl: 4 }), u8(1));
      expect(() => decode(f), `${bpp}x${planes}`).toThrow('unsupported PCX layout');
    }
  });
  it('rejects an inverted window and oversized images', () => {
    const f = header({ bpp: 8, planes: 1, width: 4, height: 1, bpl: 4 });
    f[4] = 9; // xMin 9 > xMax 3
    expect(() => decode(f)).toThrow(ExhumeError);
    const big = header({ bpp: 8, planes: 1, width: 30000, height: 30000, bpl: 30000 });
    expect(() => decode(big)).toThrow(ExhumeError);
  });
});

describe('pcx detect', () => {
  it('scores by magic and field plausibility', () => {
    expect(pcx.detect(new Uint8Array(0))).toBe(0);
    expect(pcx.detect(u8(1, 2, 3))).toBe(0);
    expect(pcx.detect(u8(0x0a, 5, 1))).toBe(0.7);
    const bad = header({ bpp: 3, planes: 1, width: 1, height: 1, bpl: 2 });
    expect(pcx.detect(bad)).toBe(0.7);
    expect(pcx.detect(header({ bpp: 8, planes: 1, width: 1, height: 1, bpl: 2 }))).toBe(0.85);
  });
});

describe('pcx encode', () => {
  const pal16 = Array.from({ length: 16 }, (_, i): [number, number, number] => [i * 16, 255 - i, i]);
  it('mono: 1 bpp x 1 plane', () => {
    const m: ImagePayload = { kind: 'image', width: 9, height: 2, bitsPerPixel: 1, palette: [[1, 2, 3], [4, 5, 6]], pixels: new Uint8Array([1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]) };
    const f = encode(m);
    expect([f[3], f[65]]).toEqual([1, 1]);
    expect(decode(f).payload).toEqual(m);
  });
  it('EGA: 1 bpp x 4 planes, header palette', () => {
    const m: ImagePayload = { kind: 'image', width: 3, height: 1, bitsPerPixel: 4, palette: pal16, pixels: new Uint8Array([15, 0, 9]) };
    const f = encode(m);
    expect([f[3], f[65]]).toEqual([1, 4]);
    expect(decode(f).payload).toEqual(m);
  });
  it('VGA: 8 bpp x 1 plane, version 5, trailer at length - 769', () => {
    const palette = Array.from({ length: 256 }, (_, i): [number, number, number] => [i, 255 - i, (i * 7) & 255]);
    const m: ImagePayload = { kind: 'image', width: 3, height: 2, bitsPerPixel: 8, palette, pixels: new Uint8Array([200, 200, 200, 1, 2, 255]) };
    const f = encode(m);
    expect([f[1], f[3], f[65]]).toEqual([5, 8, 1]);
    expect(f[f.length - 769]).toBe(0x0c);
    expect(decode(f).payload).toEqual(m);
  });
  it('24-bit: 8 bpp x 3 planes', () => {
    const m: ImagePayload = { kind: 'image', width: 2, height: 2, bitsPerPixel: 24, pixels: new Uint8Array([0, 1, 2, 255, 254, 253, 0xc0, 0xc0, 0xc0, 9, 9, 9]) };
    const f = encode(m);
    expect([f[3], f[65]]).toEqual([8, 3]);
    const s = decode(f);
    expect(s.payload).toEqual(m);
    expect(s.warnings).toEqual([]);
  });
  it('rejects malformed models', () => {
    expect(() => encode({ kind: 'image', width: 2, height: 2, bitsPerPixel: 8, pixels: new Uint8Array(3) })).toThrow(ExhumeError);
    expect(() => encode({ kind: 'image', width: 0, height: 2, bitsPerPixel: 8, pixels: new Uint8Array(0) })).toThrow(ExhumeError);
  });
});
