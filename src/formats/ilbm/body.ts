// ILBM BODY: plane rows (ByteRun1 or raw) to pixel indices (<= 8 planes, PBM) or RGB (24 planes).
import { unpackBits } from '../../core/packbits.js';

export interface BodyParams {
  width: number;
  height: number;
  nPlanes: number;
  masking: number;
  compression: number;
  pbm: boolean;
}

export interface BodyResult {
  /** width*height indices, or width*height*3 RGB bytes when nPlanes is 24. */
  pixels: Uint8Array;
  /** Absolute end offset of every row that was read (may be fewer than height when truncated). */
  rowEnds: number[];
  /** Absolute offset after the last byte consumed. */
  end: number;
  /** Row in which the data ran out, or -1. */
  truncatedRow: number;
}

export const rowBytesFor = (width: number): number => ((width + 15) >> 4) << 1;

/** Number of stored rows of `rowBytes` per image row. */
export function planeRowsFor(p: BodyParams): number {
  if (p.pbm) return 1;
  return p.nPlanes + (p.masking === 1 ? 1 : 0);
}

export function pixelBytes(p: BodyParams): number {
  return p.width * p.height * (p.nPlanes === 24 ? 3 : 1);
}

function convertRow(rowBuf: Uint8Array, rowBytes: number, p: BodyParams, y: number, out: Uint8Array): void {
  const { width, nPlanes } = p;
  if (p.pbm) {
    out.set(rowBuf.subarray(0, width), y * width);
    return;
  }
  if (nPlanes === 24) {
    for (let x = 0; x < width; x++) {
      const bi = x >> 3;
      const m = 0x80 >> (x & 7);
      let r = 0;
      let g = 0;
      let b = 0;
      for (let q = 0; q < 8; q++) {
        if (rowBuf[q * rowBytes + bi]! & m) r |= 1 << q;
        if (rowBuf[(8 + q) * rowBytes + bi]! & m) g |= 1 << q;
        if (rowBuf[(16 + q) * rowBytes + bi]! & m) b |= 1 << q;
      }
      const o = (y * width + x) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
    return;
  }
  for (let x = 0; x < width; x++) {
    const bi = x >> 3;
    const m = 0x80 >> (x & 7);
    let v = 0;
    for (let q = 0; q < nPlanes; q++) if (rowBuf[q * rowBytes + bi]! & m) v |= 1 << q;
    out[y * width + x] = v;
  }
}

/**
 * Decode BODY data `buf[start..end)`. Never throws: when the data runs out the rest of the image stays
 * index 0 (colour 0 / black for 24 planes) and `truncatedRow` says where.
 */
export function readBody(buf: Uint8Array, start: number, end: number, p: BodyParams): BodyResult {
  const rowBytes = p.pbm ? p.width + (p.width & 1) : rowBytesFor(p.width);
  const planeRows = planeRowsFor(p);
  const pixels = new Uint8Array(pixelBytes(p));
  const limited = buf.subarray(0, end);
  const rowEnds: number[] = [];
  let pos = start;
  let truncatedRow = -1;
  for (let y = 0; y < p.height && truncatedRow < 0; y++) {
    const rowBuf = new Uint8Array(planeRows * rowBytes);
    for (let q = 0; q < planeRows; q++) {
      if (p.compression === 1) {
        const res = unpackBits(limited, rowBytes, pos);
        rowBuf.set(res.out, q * rowBytes);
        pos += res.consumed;
        if (!res.complete) truncatedRow = y;
      } else {
        const n = Math.max(0, Math.min(rowBytes, end - pos));
        rowBuf.set(limited.subarray(pos, pos + n), q * rowBytes);
        pos += n;
        if (n < rowBytes) truncatedRow = y;
      }
      if (truncatedRow >= 0) break;
    }
    convertRow(rowBuf, rowBytes, p, y, pixels);
    rowEnds.push(pos);
  }
  return { pixels, rowEnds, end: pos, truncatedRow };
}
