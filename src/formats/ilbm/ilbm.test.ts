import { describe, expect, it } from 'vitest';
import { coverage } from '../../core/annotations.js';
import { ExhumeError } from '../../core/types.js';
import type { ImagePayload } from '../../core/types.js';
import { ilbm } from './index.js';

// ---- hand-built fixture helpers ----
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number): number[] => [(n >> 8) & 255, n & 255];
const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const chunk = (id: string, data: number[]): number[] => [...ascii(id), ...u32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
const form = (type: string, ...chunks: number[][]): Uint8Array => {
  const body = [...ascii(type), ...chunks.flat()];
  return new Uint8Array([...ascii('FORM'), ...u32(body.length), ...body]);
};
interface HeaderOpts { masking?: number; compression?: number }
const bmhd = (w: number, h: number, planes: number, o: HeaderOpts = {}): number[] =>
  chunk('BMHD', [...u16(w), ...u16(h), 0, 0, 0, 0, planes, o.masking ?? 0, o.compression ?? 0, 0, ...u16(0), 10, 11, ...u16(w), ...u16(h)]);
const cmap = (...c: number[][]): number[] => chunk('CMAP', c.flat());
const camg = (flags: number): number[] => chunk('CAMG', u32(flags));
/** Uncompressed planar rows: per image row, planes 0..n-1, then an optional mask row (all ones). */
function planar(idx: number[], w: number, h: number, planes: number, mask = false): number[] {
  const rb = ((w + 15) >> 4) << 1;
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let q = 0; q < planes + (mask ? 1 : 0); q++) {
      const row = new Array<number>(rb).fill(0);
      for (let x = 0; x < w; x++) {
        const bit = q === planes ? 1 : (idx[y * w + x]! >> q) & 1;
        if (bit) row[x >> 3]! |= 0x80 >> (x & 7);
      }
      out.push(...row);
    }
  }
  return out;
}
const image = (b: Uint8Array): ImagePayload => {
  const p = ilbm.decode(b).payload;
  if (p.kind !== 'image') throw new Error('not an image');
  return p;
};
const messages = (b: Uint8Array): string[] => ilbm.decode(b).warnings.map((w) => w.message);

describe('ilbm decode: modes', () => {
  it('decodes an uncompressed 1-plane BODY, MSB leftmost', () => {
    const idx = [1, 0, 0, 0, 0, 0, 0, 1, 1, 0];
    const p = image(form('ILBM', bmhd(10, 1, 1), cmap([0, 0, 0], [255, 255, 255]), chunk('BODY', planar(idx, 10, 1, 1))));
    expect(p.bitsPerPixel).toBe(1);
    expect([...p.pixels]).toEqual(idx);
    expect(p.palette).toEqual([[0, 0, 0], [255, 255, 255]]);
  });

  it('decodes ByteRun1 per plane row', () => {
    // 16x2, 1 plane: row 0 = 0xFFFF (repeat), row 1 = 0x00FF (two literals)
    const body = chunk('BODY', [255, 0xff, 1, 0x00, 0xff]);
    const p = image(form('ILBM', bmhd(16, 2, 1, { compression: 1 }), cmap([0, 0, 0], [9, 9, 9]), body));
    expect([...p.pixels]).toEqual([...Array(16).fill(1), ...Array(8).fill(0), ...Array(8).fill(1)]);
  });

  it('reports a 5-plane picture as bitsPerPixel 8 with the 32-entry CMAP', () => {
    const pal = Array.from({ length: 32 }, (_, i) => [i * 8, i * 4, i]);
    const idx = [0, 31, 17, 5, 30, 1, 2, 3];
    const p = image(form('ILBM', bmhd(8, 1, 5), cmap(...pal), chunk('BODY', planar(idx, 8, 1, 5))));
    expect(p.bitsPerPixel).toBe(8);
    expect(p.palette).toHaveLength(32);
    expect(p.palette![31]).toEqual([248, 124, 31]);
    expect([...p.pixels]).toEqual(idx);
  });

  it('maps 2-4 planes to bitsPerPixel 4', () => {
    for (const n of [2, 3, 4]) {
      const p = image(form('ILBM', bmhd(2, 1, n), cmap([0, 0, 0], [1, 1, 1]), chunk('BODY', planar([1, 0], 2, 1, n))));
      expect(p.bitsPerPixel).toBe(4);
    }
  });

  it('expands EHB to 64 entries with half-brite colours (CAMG flag)', () => {
    const pal = Array.from({ length: 32 }, (_, i) => [i * 8, 255 - i, 101]);
    const p = image(form('ILBM', bmhd(4, 1, 6), cmap(...pal), camg(0x80), chunk('BODY', planar([0, 31, 32, 63], 4, 1, 6))));
    expect(p.bitsPerPixel).toBe(8);
    expect(p.palette).toHaveLength(64);
    expect(p.palette![32]).toEqual([0, 127, 50]);
    expect(p.palette![63]).toEqual([124, 112, 50]);
    expect([...p.pixels]).toEqual([0, 31, 32, 63]);
  });

  it('treats 6 planes with a 32-entry CMAP as EHB even without CAMG', () => {
    const pal = Array.from({ length: 32 }, () => [200, 100, 50]);
    const p = image(form('ILBM', bmhd(1, 1, 6), cmap(...pal), chunk('BODY', planar([40], 1, 1, 6))));
    expect(p.palette).toHaveLength(64);
    expect(p.palette![40]).toEqual([100, 50, 25]);
  });

  it('keeps a 64-entry CMAP of 6 planes as plain indexed colour', () => {
    const pal = Array.from({ length: 64 }, (_, i) => [i, i, i]);
    const p = image(form('ILBM', bmhd(1, 1, 6), cmap(...pal), chunk('BODY', planar([40], 1, 1, 6))));
    expect(p.palette).toHaveLength(64);
    expect(p.palette![40]).toEqual([40, 40, 40]);
  });

  it('computes HAM6 pixels: palette, set-blue, set-red, set-green, row restart', () => {
    const pal = Array.from({ length: 16 }, (_, i) => [16 + i, 32 + i, 48 + i]);
    const idx = [
      0b000000, 0b011111, 0b100010, 0b110101, 0b000011, 0b101111, 0b010001, 0b111111, // row 0
      0b100001, 0b000000, 0b000000, 0b000000, 0b000000, 0b000000, 0b000000, 0b000000, // row 1
    ];
    const b = form('ILBM', bmhd(8, 2, 6), cmap(...pal), camg(0x800), chunk('BODY', planar(idx, 8, 2, 6)));
    const p = image(b);
    expect(p.bitsPerPixel).toBe(24);
    expect(p.palette).toBeUndefined();
    const px = (x: number, y = 0): number[] => [...p.pixels.subarray((y * 8 + x) * 3, (y * 8 + x) * 3 + 3)];
    expect(px(0)).toEqual([16, 32, 48]); // 00 0000: palette colour 0
    expect(px(1)).toEqual([16, 32, 255]); // 01 1111: blue = 15*17
    expect(px(2)).toEqual([34, 32, 255]); // 10 0010: red = 2*17
    expect(px(3)).toEqual([34, 85, 255]); // 11 0101: green = 5*17
    expect(px(4)).toEqual([19, 35, 51]); // 00 0011: palette colour 3
    expect(px(5)).toEqual([255, 35, 51]); // 10 1111: red = 255
    expect(px(6)).toEqual([255, 35, 17]); // 01 0001: blue = 17
    expect(px(7)).toEqual([255, 255, 17]); // 11 1111: green = 255
    expect(px(0, 1)).toEqual([17, 32, 48]); // row 1 restarts from palette colour 0: red = 17
    expect(px(1, 1)).toEqual([16, 32, 48]); // 00 0000 back to colour 0
  });

  it('decodes 24 planes as RGB (planes 0-7 red, 8-15 green, 16-23 blue)', () => {
    // one pixel 0x12 0x34 0x56 -> planes
    const rgb = 0x12 | (0x34 << 8) | (0x56 << 16);
    const rows: number[] = [];
    for (let q = 0; q < 24; q++) rows.push((rgb >> q) & 1 ? 0x80 : 0, 0);
    const b = form('ILBM', bmhd(1, 1, 24), chunk('BODY', rows));
    const p = image(b);
    expect(p.bitsPerPixel).toBe(24);
    expect(p.palette).toBeUndefined();
    expect([...p.pixels]).toEqual([0x12, 0x34, 0x56]);
    expect(ilbm.decode(b).warnings).toEqual([]);
  });

  it('decodes and discards the mask plane (masking = 1)', () => {
    const idx = [1, 2, 3, 0];
    const p = image(form('ILBM', bmhd(4, 1, 2, { masking: 1 }), cmap([0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]), chunk('BODY', planar(idx, 4, 1, 2, true))));
    expect([...p.pixels]).toEqual(idx);
  });

  it('decodes PBM chunky rows padded to even width', () => {
    // width 3 -> rows of 4 bytes; compressed per row
    const body = chunk('BODY', [3, 7, 8, 9, 0, 3, 0, 5, 6, 0]);
    const pal = Array.from({ length: 256 }, (_, i) => [i, i, i]);
    const p = image(form('PBM ', bmhd(3, 2, 8, { compression: 1 }), cmap(...pal), body));
    expect([...p.pixels]).toEqual([7, 8, 9, 0, 5, 6]);
    expect(p.bitsPerPixel).toBe(8);
    expect(p.palette).toHaveLength(256);
  });

  it('decodes uncompressed PBM', () => {
    const p = image(form('PBM ', bmhd(3, 1, 8), cmap([0, 0, 0]), chunk('BODY', [4, 5, 6, 0])));
    expect([...p.pixels]).toEqual([4, 5, 6]);
  });
});

describe('ilbm decode: container', () => {
  const base = (...extra: number[][]): Uint8Array =>
    form('ILBM', bmhd(2, 1, 1), ...extra, cmap([0, 0, 0], [255, 255, 255]), chunk('BODY', planar([1, 0], 2, 1, 1)));

  it('annotates and skips an unknown chunk', () => {
    const b = base(chunk('XYZW', [1, 2, 3, 4]));
    const s = ilbm.decode(b);
    expect(s.warnings).toEqual([]);
    expect(s.annotations.map((a) => a.label)).toEqual(['FORM header', 'chunk BMHD', 'chunk XYZW', 'chunk CMAP', 'chunk BODY']);
    expect(coverage(s.annotations, b.length).exact).toBe(true);
    expect(image(b).pixels).toEqual(new Uint8Array([1, 0]));
  });

  it('honours the pad byte of an odd-length chunk', () => {
    const b = base(chunk('ANNO', ascii('abc')));
    const s = ilbm.decode(b);
    expect(s.warnings).toEqual([]);
    const anno = s.annotations.find((a) => a.label === 'chunk ANNO')!;
    expect(anno.end - anno.start).toBe(12);
    expect(anno.children!.map((c) => c.label)).toEqual(['id', 'size', 'data (unknown chunk, skipped)', 'pad']);
    expect(coverage(s.annotations, b.length).exact).toBe(true);
    expect(image(b).palette).toHaveLength(2);
  });

  it('annotates BMHD fields, CMAP colours and BODY rows', () => {
    const s = ilbm.decode(form('ILBM', bmhd(2, 3, 1), cmap([1, 2, 3], [4, 5, 6]), chunk('BODY', planar([1, 0, 0, 1, 1, 1], 2, 3, 1))));
    const labels = (name: string): string[] => s.annotations.find((a) => a.label === name)!.children!.map((c) => c.label);
    expect(labels('chunk BMHD')).toEqual(['id', 'size', 'width', 'height', 'xOrigin', 'yOrigin', 'nPlanes', 'masking', 'compression', 'pad', 'transparentColor', 'xAspect', 'yAspect', 'pageWidth', 'pageHeight']);
    expect(labels('chunk BODY')).toEqual(['id', 'size', 'row 0', 'row 1', 'row 2']);
    const cm = s.annotations.find((a) => a.label === 'chunk CMAP')!.children!.find((c) => c.label === 'palette')!;
    expect(cm.children![1]).toMatchObject({ label: 'colour 1', value: '#040506' });
  });

  it('warns and uses a grey ramp when CMAP is missing', () => {
    const b = form('ILBM', bmhd(2, 1, 2), chunk('BODY', planar([0, 3], 2, 1, 2)));
    const p = image(b);
    expect(p.palette).toEqual([[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]]);
    expect(messages(b)).toContain('no CMAP chunk: greyscale ramp used');
  });

  it('fills index 0 and warns when BODY is truncated', () => {
    const idx = [1, 1, 1, 1, 1, 1, 1, 1];
    const full = planar(idx, 8, 4, 1); // 2 bytes per row
    const b = form('ILBM', bmhd(8, 4, 1), cmap([0, 0, 0], [9, 9, 9]), chunk('BODY', full));
    const cut = b.slice(0, b.length - 5); // lose 5 bytes: row 1 partly, rows 2-3 fully
    const s = ilbm.decode(cut);
    const p = s.payload as ImagePayload;
    expect([...p.pixels]).toEqual([...Array(8).fill(1), ...Array(24).fill(0)]);
    expect(s.warnings.map((w) => w.message).join('|')).toMatch(/BODY ends inside row 1 of 4/);
  });

  it('warns for a compressed BODY cut mid-row', () => {
    const b = form('ILBM', bmhd(16, 2, 1, { compression: 1 }), cmap([0, 0, 0], [9, 9, 9]), chunk('BODY', [255, 0xff, 1, 0x00]));
    const s = ilbm.decode(b);
    expect((s.payload as ImagePayload).pixels.subarray(0, 16)).toEqual(new Uint8Array(16).fill(1));
    expect(s.warnings.some((w) => /BODY ends inside row 1/.test(w.message))).toBe(true);
  });

  it('warns and zero-fills when BODY is missing', () => {
    const b = form('ILBM', bmhd(3, 2, 1), cmap([0, 0, 0], [9, 9, 9]));
    expect([...image(b).pixels]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(messages(b)).toContain('no BODY chunk: every pixel is index 0');
  });

  it('truncates a CMAP whose size is not a multiple of 3', () => {
    const b = form('ILBM', bmhd(1, 1, 1), chunk('CMAP', [1, 2, 3, 4, 5, 6, 7]), chunk('BODY', [0, 0]));
    expect(image(b).palette).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(messages(b).join('|')).toMatch(/not a multiple of 3/);
  });

  it('keeps at most 256 CMAP colours', () => {
    const b = form('ILBM', bmhd(1, 1, 8), chunk('CMAP', new Array(300 * 3).fill(7)), chunk('BODY', new Array(16).fill(0)));
    expect(image(b).palette).toHaveLength(256);
    expect(messages(b).join('|')).toMatch(/only the first 256/);
  });

  it('warns about a FORM size larger than the file, a chunk larger than the FORM and stray bytes', () => {
    const b = base();
    const big = b.slice();
    big[7] = (big[7]! + 40) & 255;
    expect(messages(big).join('|')).toMatch(/FORM claims/);
    const stray = new Uint8Array([...b, 1, 2, 3]);
    expect(messages(stray).join('|')).toMatch(/3 stray byte/);
    const cutChunk = form('ILBM', bmhd(2, 1, 1)).slice();
    cutChunk[19] = 0xff; // BMHD size now far beyond the file
    expect(messages(cutChunk).join('|')).toMatch(/claims/);
  });

  it('ignores duplicate chunks, a BODY before BMHD and short CAMG/BMHD with warnings', () => {
    const body = chunk('BODY', planar([1, 0], 2, 1, 1));
    const b = form('ILBM', body, bmhd(2, 1, 1), cmap([0, 0, 0], [5, 5, 5]), cmap([9, 9, 9]), bmhd(4, 4, 4), chunk('CAMG', [1, 2]), body);
    const s = ilbm.decode(b);
    const m = s.warnings.map((w) => w.message).join('|');
    expect(m).toMatch(/BODY before BMHD/);
    expect(m).toMatch(/duplicate CMAP/);
    expect(m).toMatch(/duplicate BMHD/);
    expect(m).toMatch(/CAMG shorter/);
    expect((s.payload as ImagePayload).palette).toEqual([[0, 0, 0], [5, 5, 5]]);
  });

  it('shows HAM flag with 5 planes as indexed with a warning', () => {
    const b = form('ILBM', bmhd(1, 1, 5), cmap([1, 1, 1]), camg(0x800), chunk('BODY', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(image(b).bitsPerPixel).toBe(8);
    expect(messages(b).join('|')).toMatch(/HAM with 5 planes/);
  });

  it('bands BODY row annotations for tall images', () => {
    const w = 8;
    const h = 5000;
    const b = form('ILBM', bmhd(w, h, 1, { compression: 1 }), cmap([0, 0, 0], [1, 1, 1]), chunk('BODY', new Array(h * 2).fill(0).flatMap(() => [0, 0]).slice(0, h * 4)));
    const s = ilbm.decode(b);
    const body = s.annotations.find((a) => a.label === 'chunk BODY')!;
    expect(body.children!.length).toBeLessThanOrEqual(2004);
    expect(coverage(s.annotations, b.length).exact).toBe(true);
  });
});

describe('ilbm errors', () => {
  const bad = (b: Uint8Array): void => {
    expect(() => ilbm.decode(b)).toThrow(ExhumeError);
  };
  it('rejects non-ILBM input', () => {
    bad(new Uint8Array());
    bad(new Uint8Array(40));
    expect(() => ilbm.decode(form('8SVX', chunk('VHDR', [0])))).toThrow('not an IFF ILBM file');
  });
  it('rejects unusable headers', () => {
    bad(form('ILBM', cmap([1, 2, 3])));
    bad(form('ILBM', bmhd(4, 4, 9)));
    bad(form('ILBM', bmhd(4, 4, 0)));
    bad(form('ILBM', bmhd(0, 4, 1)));
    bad(form('ILBM', bmhd(4, 4, 1, { compression: 2 })));
    bad(form('PBM ', bmhd(4, 4, 4)));
    bad(form('ILBM', chunk('BMHD', [0, 1])));
    bad(form('ILBM', bmhd(32768, 32768, 1)));
  });
  it('detects by magic', () => {
    expect(ilbm.detect(form('ILBM', bmhd(1, 1, 1)))).toBe(0.95);
    expect(ilbm.detect(form('PBM ', bmhd(1, 1, 8)))).toBe(0.95);
    expect(ilbm.detect(form('8SVX'))).toBe(0.1);
    expect(ilbm.detect(new Uint8Array(ascii('FORM')))).toBe(0.1);
    expect(ilbm.detect(new Uint8Array(ascii('GIF89a......')))).toBe(0);
    expect(ilbm.detect(new Uint8Array())).toBe(0);
  });
});

describe('ilbm encode', () => {
  const model: ImagePayload = {
    kind: 'image', width: 3, height: 2, bitsPerPixel: 4, palette: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    pixels: new Uint8Array([0, 1, 2, 2, 1, 0]),
  };
  it('writes FORM/ILBM with BMHD, CMAP, CAMG 0 and a ByteRun1 BODY', () => {
    const b = ilbm.encode!(model);
    const s = ilbm.decode(b);
    expect(s.annotations.map((a) => a.label)).toEqual(['FORM header', 'chunk BMHD', 'chunk CMAP', 'chunk CAMG', 'chunk BODY']);
    expect(String.fromCharCode(...b.subarray(0, 4), ...b.subarray(8, 12))).toBe('FORMILBM');
    expect(b[8 + 4 + 8 + 8]).toBe(4); // nPlanes = bitsPerPixel
    expect(b[8 + 4 + 8 + 10]).toBe(1); // compression
    expect(s.payload).toEqual(model);
    expect(coverage(s.annotations, b.length).exact).toBe(true);
  });
  it('writes 24 planes without CMAP or CAMG', () => {
    const m: ImagePayload = { kind: 'image', width: 2, height: 1, bitsPerPixel: 24, pixels: new Uint8Array([1, 2, 3, 250, 251, 252]) };
    const s = ilbm.decode(ilbm.encode!(m));
    expect(s.annotations.map((a) => a.label)).toEqual(['FORM header', 'chunk BMHD', 'chunk BODY']);
    expect(s.payload).toEqual(m);
  });
  it('rejects models it cannot write', () => {
    expect(() => ilbm.encode!({ ...model, pixels: new Uint8Array(1) })).toThrow(ExhumeError);
    expect(() => ilbm.encode!({ ...model, width: 0, pixels: new Uint8Array(0) })).toThrow(ExhumeError);
    expect(() => ilbm.encode!({ kind: 'document', blocks: [] })).toThrow(ExhumeError);
  });
});
