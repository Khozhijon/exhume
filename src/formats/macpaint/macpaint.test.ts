import { describe, expect, it } from 'vitest';
import { coverage } from '../../core/annotations.js';
import { ExhumeError } from '../../core/types.js';
import type { Annotation, ImagePayload } from '../../core/types.js';
import { decode, hasMacBinary } from './decode.js';
import { encode } from './encode.js';
import { macpaint } from './index.js';

const W = 576;
const H = 720;

function blank(): ImagePayload {
  return {
    kind: 'image', width: W, height: H, bitsPerPixel: 1,
    palette: [[255, 255, 255], [0, 0, 0]],
    pixels: new Uint8Array(W * H),
    patterns: Array.from({ length: 38 }, () => new Uint8Array(8)),
  };
}

/** Hand-built minimal file: version 2 header, then each row as one PackBits run of 72 bytes. */
function minimalFile(rowByte: (row: number) => number, version = 2): Uint8Array {
  const out = new Uint8Array(512 + H * 2);
  out[3] = version;
  for (let r = 0; r < H; r++) {
    out[512 + r * 2] = 0xb9; // 257-185 = 72 repeats
    out[512 + r * 2 + 1] = rowByte(r);
  }
  return out;
}

function macBinary(data: Uint8Array): Uint8Array {
  const h = new Uint8Array(128);
  h[1] = 5;
  h.set([0x74, 0x65, 0x73, 0x74, 0x31], 2);
  h.set([0x50, 0x4e, 0x54, 0x47], 65);
  h.set([0x4d, 0x50, 0x4e, 0x54], 69);
  const out = new Uint8Array(128 + data.length + 128);
  out.set(h);
  out.set(data, 128);
  return out;
}

describe('macpaint decode', () => {
  it('decodes a minimal valid fixture', () => {
    const s = decode(minimalFile((r) => (r === 1 ? 0xff : r === 2 ? 0x80 : 0x00)));
    expect(s.warnings).toEqual([]);
    const p = s.payload as ImagePayload;
    expect(p.width).toBe(W);
    expect(p.height).toBe(H);
    expect(p.bitsPerPixel).toBe(1);
    expect(p.palette).toEqual([[255, 255, 255], [0, 0, 0]]);
    expect(p.pixels.length).toBe(W * H);
    expect(p.pixels[0]).toBe(0);
    expect(p.pixels[W]).toBe(1); // row 1 all black
    expect(p.pixels[W + 575]).toBe(1);
    expect(p.pixels[2 * W]).toBe(1); // row 2: only the leftmost pixel of every byte
    expect(p.pixels[2 * W + 1]).toBe(0);
    expect(p.pixels[2 * W + 8]).toBe(1);
    expect(p.patterns).toHaveLength(38);
    expect(s.meta).toMatchObject({ width: W, height: H, bitsPerPixel: 1 });
  });

  it('annotates header, bitmap rows and slack', () => {
    const file = minimalFile(() => 0);
    const withSlack = new Uint8Array(file.length + 10);
    withSlack.set(file);
    const s = decode(withSlack);
    expect(s.warnings).toEqual([]);
    const labels = s.annotations.map((a: Annotation) => a.label);
    expect(labels).toEqual(['documentHeader', 'bitmap', 'slack']);
    expect(s.annotations[1]!.children).toHaveLength(H);
    expect(coverage(s.annotations, withSlack.length).exact).toBe(true);
  });

  it('fills white and warns when the bitmap is truncated', () => {
    const file = minimalFile(() => 0xff);
    const cut = file.slice(0, 512 + 10 * 2 + 1); // 10 full rows, then a dangling opcode
    const s = decode(cut);
    expect(s.warnings.length).toBeGreaterThan(0);
    const p = s.payload as ImagePayload;
    expect(p.pixels[9 * W + 5]).toBe(1);
    expect(p.pixels[10 * W]).toBe(0);
    expect(p.pixels[H * W - 1]).toBe(0);
  });

  it('skips a MacBinary wrapper', () => {
    const inner = minimalFile((r) => (r === 0 ? 0xff : 0));
    const file = macBinary(inner);
    expect(hasMacBinary(file)).toBe(true);
    const s = decode(file);
    expect(s.warnings).toEqual([]);
    expect((s.payload as ImagePayload).pixels[0]).toBe(1);
    expect(s.annotations.map((a: Annotation) => a.label)).toEqual(['macBinaryHeader', 'documentHeader', 'bitmap', 'slack']);
    expect(s.annotations[0]!.end).toBe(128);
    expect(coverage(s.annotations, file.length).exact).toBe(true);
    expect(macpaint.detect(file)).toBe(0.95);
  });

  it('warns about an unknown version and keeps decoding', () => {
    const s = decode(minimalFile(() => 0xaa, 7));
    expect(s.warnings.some((w) => /version/.test(w.message))).toBe(true);
    expect((s.payload as ImagePayload).pixels[0]).toBe(1);
  });

  it('version 0 ignores the patterns without a warning', () => {
    const f = minimalFile(() => 0, 0);
    f[4] = 0xff;
    const s = decode(f);
    expect(s.warnings).toEqual([]);
    expect((s.payload as ImagePayload).patterns![0]).toEqual(new Uint8Array(8));
  });

  it('reads the patterns of a version 2 file', () => {
    const f = minimalFile(() => 0);
    f.set([1, 2, 3, 4, 5, 6, 7, 8], 4 + 37 * 8);
    expect((decode(f).payload as ImagePayload).patterns![37]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('treats runs as one stream and ignores no-op bytes', () => {
    const f = new Uint8Array(512 + 2 * 2 + 1 + 2);
    f[3] = 2;
    f[512] = 0x80; // no-op
    f[513] = 0x81 + 0; // 257-129 = 128 repeats of 0xff: crosses into row 1
    f[514] = 0xff;
    f[515] = 0xb9; // 72 repeats of 0
    f[516] = 0;
    const s = decode(f);
    const p = s.payload as ImagePayload;
    expect(p.pixels[W + 447]).toBe(1); // the first run covers row 0 and the first 56 bytes of row 1
    expect(p.pixels[W + 448]).toBe(0);
    expect(s.warnings.length).toBeGreaterThan(0); // only 2 rows of 720 present
    expect(s.annotations[1]!.children!.length).toBeGreaterThanOrEqual(2);
  });

  it('throws ExhumeError for a file shorter than the header', () => {
    expect(() => decode(new Uint8Array(100))).toThrow(ExhumeError);
    expect(() => decode(new Uint8Array(0))).toThrow(ExhumeError);
  });
});

describe('macpaint detect', () => {
  it('scores raw version 0/2 at 0.6 and others near zero', () => {
    expect(macpaint.detect(minimalFile(() => 0, 2))).toBe(0.6);
    expect(macpaint.detect(minimalFile(() => 0, 0))).toBe(0.6);
    expect(macpaint.detect(minimalFile(() => 0, 5))).toBe(0);
    expect(macpaint.detect(new Uint8Array(10))).toBe(0);
    expect(macpaint.detect(new Uint8Array(10), 'x.mac')).toBeLessThan(0.3);
  });
});

describe('macpaint encode', () => {
  it('writes no MacBinary wrapper and version 2', () => {
    const bytes = encode(blank());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0, 0, 0, 2]);
    expect(hasMacBinary(bytes)).toBe(false);
    expect(bytes.length).toBe(512 + 720 * 2); // each blank row is one 72-byte run
  });

  it('round-trips a drawn image with patterns', () => {
    const m = blank();
    for (let y = 100; y < 200; y++) for (let x = 50; x < 300; x++) m.pixels[y * W + x] = 1;
    m.pixels[W * H - 1] = 1;
    m.patterns![3] = new Uint8Array([0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55]);
    const s = decode(encode(m));
    expect(s.warnings).toEqual([]);
    expect(s.payload).toEqual(m);
  });

  it('rejects a model of the wrong size', () => {
    expect(() => encode({ ...blank(), width: 10 })).toThrow(ExhumeError);
  });
});
