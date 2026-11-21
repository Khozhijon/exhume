// MacPaint decoder (docs/formats/macpaint.md). Big-endian. Optional 128-byte MacBinary wrapper.
import { ByteReader } from '../../core/reader.js';
import { unpackBits } from '../../core/packbits.js';
import { ExhumeError } from '../../core/types.js';
import type { ImagePayload, Specimen, Warning } from '../../core/types.js';

export const WIDTH = 576;
export const HEIGHT = 720;
export const ROW_BYTES = WIDTH / 8; // 72
export const BITMAP_BYTES = ROW_BYTES * HEIGHT; // 51,840
export const PATTERN_COUNT = 38;
export const HEADER_BYTES = 512;
export const MACBINARY_BYTES = 128;

/** True when the first 128 bytes look like a MacBinary header for a PNTG file. */
export function hasMacBinary(b: Uint8Array): boolean {
  if (b.length < MACBINARY_BYTES) return false;
  const nameLen = b[1]!;
  return (
    b[0] === 0 &&
    nameLen >= 1 &&
    nameLen <= 63 &&
    b[65] === 0x50 && // P
    b[66] === 0x4e && // N
    b[67] === 0x54 && // T
    b[68] === 0x47 && // G
    b[74] === 0 &&
    b[82] === 0
  );
}

/**
 * Walk the PackBits stream the way unpackBits does and report, for each output row, the input offset
 * after the opcode that completed it (runs may cross rows in non-canonical files: such rows get
 * zero-length spans). The last entry is the end of a partial row when the input ended early.
 */
function rowEnds(src: Uint8Array, from: number, end: number): number[] {
  const ends: number[] = [];
  let o = 0;
  let i = from;
  while (o < BITMAP_BYTES && i < end) {
    const n = src[i++]!;
    if (n < 128) {
      const take = Math.min(n + 1, end - i, BITMAP_BYTES - o);
      i += take;
      o += take;
      if (take < n + 1 && o < BITMAP_BYTES) break;
    } else if (n > 128) {
      if (i >= end) break;
      i++;
      o = Math.min(BITMAP_BYTES, o + 257 - n);
    }
    while (ends.length < Math.floor(o / ROW_BYTES)) ends.push(i);
  }
  if (ends.length < HEIGHT && o % ROW_BYTES !== 0) ends.push(i);
  return ends;
}

export function decode(bytes: Uint8Array): Specimen {
  const warnings: Warning[] = [];
  const r = new ByteReader(bytes);
  let base = 0;
  if (hasMacBinary(bytes)) {
    r.group('macBinaryHeader', () => {
      r.skip(65, 'preamble');
      r.bytes(4, 'fileType');
      r.bytes(4, 'creator');
      r.skip(MACBINARY_BYTES - 73, 'rest');
    });
    base = MACBINARY_BYTES;
  }
  if (bytes.length < base + HEADER_BYTES) {
    throw new ExhumeError('too short for a MacPaint document header', 'macpaint');
  }

  let version = 0;
  const patterns: Uint8Array[] = [];
  r.group('documentHeader', () => {
    version = r.u32be('version');
    if (version !== 0 && version !== 2) {
      warnings.push({ message: `unknown MacPaint version ${version} (expected 0 or 2); patterns ignored`, offset: base });
    }
    r.group('patterns', () => {
      for (let i = 0; i < PATTERN_COUNT; i++) patterns.push(r.bytes(8, `pattern ${i}`).slice());
    });
    r.skip(HEADER_BYTES - 4 - PATTERN_COUNT * 8, 'padding');
  });
  // Patterns are only meaningful for version 2; otherwise they read as zeros.
  const outPatterns = version === 2 ? patterns : patterns.map(() => new Uint8Array(8));

  const start = r.offset;
  const res = unpackBits(bytes, BITMAP_BYTES, start);
  const end = start + res.consumed;
  const ends = rowEnds(bytes, start, end);
  r.group('bitmap', () => {
    let prev = start;
    for (let row = 0; row < ends.length; row++) {
      const e = Math.min(ends[row]!, end);
      r.mark(`row ${row}`, prev, e, `${e - prev} bytes`);
      prev = e;
    }
    r.seek(end);
  });
  if (!res.complete) {
    const rows = Math.floor(res.produced / ROW_BYTES);
    warnings.push({
      message: `bitmap data ended after ${res.produced} of ${BITMAP_BYTES} bytes (${rows} full rows); the rest is filled white`,
      offset: end,
    });
  }
  if (r.remaining > 0) r.skip(r.remaining, 'slack');

  const pixels = new Uint8Array(WIDTH * HEIGHT);
  const bits = res.out;
  for (let i = 0; i < BITMAP_BYTES; i++) {
    const v = bits[i]!;
    if (v === 0) continue;
    const p = i * 8;
    for (let k = 0; k < 8; k++) pixels[p + k] = (v >> (7 - k)) & 1;
  }
  const payload: ImagePayload = {
    kind: 'image',
    width: WIDTH,
    height: HEIGHT,
    bitsPerPixel: 1,
    palette: [
      [255, 255, 255],
      [0, 0, 0],
    ],
    pixels,
    patterns: outPatterns,
  };
  return { payload, annotations: r.annotations(), warnings, meta: { width: WIDTH, height: HEIGHT, bitsPerPixel: 1 } };
}
