// ILBM container: FORM header, chunk walking, BMHD / CMAP / CAMG / BODY handlers.
import { assertLimit, MAX_IMAGE_HEIGHT, MAX_IMAGE_PIXELS, MAX_IMAGE_WIDTH } from '../../core/limits.js';
import { latin1 } from '../../core/codepage.js';
import type { ByteReader } from '../../core/reader.js';
import { ExhumeError } from '../../core/types.js';
import type { Warning } from '../../core/types.js';
import { type BodyParams, readBody } from './body.js';
import type { Rgb } from './colour.js';

const FMT = 'ilbm';
const MAX_BODY_MARKS = 2000;
export const MAX_PALETTE = 256;

export interface Bmhd {
  width: number;
  height: number;
  nPlanes: number;
  masking: number;
  compression: number;
}

export interface IlbmState {
  pbm: boolean;
  bmhd?: Bmhd;
  cmap?: Rgb[];
  camg?: number;
  pixels?: Uint8Array;
}

export interface WalkContext {
  r: ByteReader;
  state: IlbmState;
  warnings: Warning[];
}

function i16be(r: ByteReader, label: string): void {
  const hi = r.peek() ?? 0;
  const lo = r.peek(r.offset + 1) ?? 0;
  const v = (hi << 8) | lo;
  r.mark(label, r.offset, r.offset + 2, String(v >= 0x8000 ? v - 0x10000 : v));
}

function chunkId(r: ByteReader): string {
  let id = '';
  for (let i = 0; i < 4; i++) id += latin1(r.peek(r.offset + i) ?? 0);
  return id;
}

function skipData(ctx: WalkContext, end: number, label: string): void {
  const n = end - ctx.r.offset;
  if (n > 0) ctx.r.skip(n, label);
}

function readBmhd(ctx: WalkContext, end: number): void {
  const { r, state, warnings } = ctx;
  if (state.bmhd) {
    warnings.push({ message: 'duplicate BMHD chunk ignored', offset: r.offset });
    skipData(ctx, end, 'data (duplicate, ignored)');
    return;
  }
  if (end - r.offset < 20) {
    warnings.push({ message: `BMHD is ${end - r.offset} bytes, expected 20`, offset: r.offset });
    skipData(ctx, end, 'data (too short)');
    return;
  }
  const width = r.u16be('width');
  const height = r.u16be('height');
  i16be(r, 'xOrigin');
  i16be(r, 'yOrigin');
  const nPlanes = r.u8('nPlanes');
  const masking = r.u8('masking');
  const compression = r.u8('compression');
  r.u8('pad');
  r.u16be('transparentColor');
  r.u8('xAspect');
  r.u8('yAspect');
  i16be(r, 'pageWidth');
  i16be(r, 'pageHeight');
  skipData(ctx, end, 'extra bytes');
  if (width === 0 || height === 0) throw new ExhumeError(`ILBM image is ${width}x${height}`, FMT);
  assertLimit(width, MAX_IMAGE_WIDTH, 'ILBM width');
  assertLimit(height, MAX_IMAGE_HEIGHT, 'ILBM height');
  assertLimit(width * height, MAX_IMAGE_PIXELS, 'ILBM pixel count');
  if (!((nPlanes >= 1 && nPlanes <= 8) || nPlanes === 24)) throw new ExhumeError(`unsupported ILBM nPlanes ${nPlanes}`, FMT);
  if (state.pbm && nPlanes !== 8) throw new ExhumeError(`unsupported PBM with ${nPlanes} planes`, FMT);
  if (compression > 1) throw new ExhumeError(`unsupported ILBM compression ${compression}`, FMT);
  if (masking > 3) warnings.push({ message: `unknown masking value ${masking}`, offset: r.offset });
  state.bmhd = { width, height, nPlanes, masking, compression };
}

function readCmap(ctx: WalkContext, end: number): void {
  const { r, state, warnings } = ctx;
  if (state.cmap) {
    warnings.push({ message: 'duplicate CMAP chunk ignored', offset: r.offset });
    skipData(ctx, end, 'data (duplicate, ignored)');
    return;
  }
  const avail = end - r.offset;
  const total = Math.floor(avail / 3);
  if (avail % 3 !== 0) warnings.push({ message: `CMAP size ${avail} is not a multiple of 3: last ${avail % 3} byte(s) dropped`, offset: r.offset });
  const kept = Math.min(total, MAX_PALETTE);
  if (total > MAX_PALETTE) warnings.push({ message: `CMAP has ${total} colours: only the first ${MAX_PALETTE} kept`, offset: r.offset });
  const buf = r.buffer_;
  const palette: Rgb[] = [];
  r.group('palette', () => {
    for (let i = 0; i < kept; i++) {
      const o = r.offset;
      const c: Rgb = [buf[o]!, buf[o + 1]!, buf[o + 2]!];
      palette.push(c);
      const hex = c.map((v) => v.toString(16).padStart(2, '0')).join('');
      r.mark(`colour ${i}`, o, o + 3, `#${hex}`);
    }
  });
  skipData(ctx, end, 'unused bytes');
  state.cmap = palette;
}

function readCamg(ctx: WalkContext, end: number): void {
  const { r, state, warnings } = ctx;
  if (end - r.offset < 4) {
    warnings.push({ message: 'CAMG shorter than 4 bytes ignored', offset: r.offset });
    skipData(ctx, end, 'data (too short)');
    return;
  }
  state.camg = r.u32be('viewportModes');
  skipData(ctx, end, 'extra bytes');
}

function markRows(r: ByteReader, start: number, rowEnds: number[]): void {
  const per = Math.max(1, Math.ceil(rowEnds.length / MAX_BODY_MARKS));
  for (let a = 0; a < rowEnds.length; a += per) {
    const b = Math.min(rowEnds.length, a + per) - 1;
    const s = a === 0 ? start : rowEnds[a - 1]!;
    r.mark(a === b ? `row ${a}` : `rows ${a}-${b}`, s, rowEnds[b]!, `${rowEnds[b]! - s} bytes`);
  }
}

function readBodyChunk(ctx: WalkContext, end: number): void {
  const { r, state, warnings } = ctx;
  const bmhd = state.bmhd;
  if (!bmhd) {
    warnings.push({ message: 'BODY before BMHD ignored', offset: r.offset });
    skipData(ctx, end, 'data (ignored)');
    return;
  }
  if (state.pixels) {
    warnings.push({ message: 'duplicate BODY chunk ignored', offset: r.offset });
    skipData(ctx, end, 'data (duplicate, ignored)');
    return;
  }
  const params: BodyParams = { ...bmhd, pbm: state.pbm };
  const start = r.offset;
  const res = readBody(r.buffer_, start, end, params);
  state.pixels = res.pixels;
  markRows(r, start, res.rowEnds);
  if (res.truncatedRow >= 0) {
    warnings.push({
      message: `BODY ends inside row ${res.truncatedRow} of ${bmhd.height}: the rest is filled with index 0`,
      offset: res.end,
    });
  }
  if (res.end < end) r.mark('unused body bytes', res.end, end);
}

/** Walk chunks from the cursor to `formEnd`, annotating each as a top-level group "chunk XXXX". */
export function walkChunks(ctx: WalkContext, formEnd: number): void {
  const { r, warnings } = ctx;
  while (r.offset + 8 <= formEnd) {
    const id = chunkId(r);
    r.group(`chunk ${id}`, () => {
      r.text(4, 'id', latin1);
      const size = r.u32be('size');
      const avail = Math.min(size, formEnd - r.offset);
      if (avail < size) warnings.push({ message: `chunk ${id} claims ${size} bytes but only ${avail} remain`, offset: r.offset });
      const end = r.offset + avail;
      if (id === 'BMHD') readBmhd(ctx, end);
      else if (id === 'CMAP') readCmap(ctx, end);
      else if (id === 'CAMG') readCamg(ctx, end);
      else if (id === 'BODY') readBodyChunk(ctx, end);
      else skipData(ctx, end, 'data (unknown chunk, skipped)');
      if (size % 2 === 1 && r.offset < formEnd) r.skip(1, 'pad');
    });
  }
  if (r.offset < r.size) {
    const n = r.size - r.offset;
    warnings.push({ message: `${n} stray byte(s) after the last chunk`, offset: r.offset });
    r.skip(n, 'stray bytes');
  }
}
