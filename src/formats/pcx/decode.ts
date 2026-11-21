// PCX decoder (docs/formats/pcx.md). Little-endian. Six layouts: 1x1, 1x4, 4x1, 8x1, 8x3, 2x1.
// Decoded palettes have a fixed length per depth: 2 (mono), 16 (EGA / packed 4bpp), 4 (CGA 2bpp),
// 256 (VGA); 24-bit images have none. 2bpp CGA is reported as bitsPerPixel 4 with a 4-entry palette
// (ImagePayload has no 2-bit depth).
import { ByteReader } from '../../core/reader.js';
import { assertLimit, MAX_DECOMPRESSED_SIZE, MAX_IMAGE_HEIGHT, MAX_IMAGE_PIXELS, MAX_IMAGE_WIDTH } from '../../core/limits.js';
import { ExhumeError } from '../../core/types.js';
import type { ImagePayload, Specimen, Warning } from '../../core/types.js';
import { rleDecode } from './rle.js';
import type { RleResult } from './rle.js';

type RGB = [number, number, number];
const HEADER = 128;
const MAX_CHILDREN = 2048;
const CGA: RGB[] = [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]];
const LAYOUTS = new Set(['1x1', '1x4', '4x1', '8x1', '8x3', '2x1']);

function triples(b: Uint8Array, n: number): RGB[] {
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) out.push([b[i * 3]!, b[i * 3 + 1]!, b[i * 3 + 2]!]);
  return out;
}

export function decode(bytes: Uint8Array): Specimen {
  if (bytes.length === 0 || bytes[0] !== 0x0a) throw new ExhumeError('not a PCX file', 'pcx');
  if (bytes.length < HEADER) throw new ExhumeError('PCX header is truncated', 'pcx');
  const warnings: Warning[] = [];
  const r = new ByteReader(bytes);

  const h = r.group('header', () => {
    r.u8('manufacturer');
    const version = r.u8('version');
    const encoding = r.u8('encoding');
    const bpp = r.u8('bitsPerPixel');
    const xMin = r.u16le('xMin');
    const yMin = r.u16le('yMin');
    const xMax = r.u16le('xMax');
    const yMax = r.u16le('yMax');
    r.u16le('hDpi');
    r.u16le('vDpi');
    const ega = r.bytes(48, 'egaPalette');
    r.u8('reserved');
    const planes = r.u8('nPlanes');
    const bpl = r.u16le('bytesPerLine');
    r.u16le('paletteInfo');
    r.u16le('hScreenSize');
    r.u16le('vScreenSize');
    r.skip(54, 'filler');
    return { version, encoding, bpp, xMin, yMin, xMax, yMax, ega, planes, bpl };
  });

  if (h.xMax < h.xMin || h.yMax < h.yMin) throw new ExhumeError('PCX has an empty or inverted image window', 'pcx');
  const width = h.xMax - h.xMin + 1;
  const height = h.yMax - h.yMin + 1;
  assertLimit(width, MAX_IMAGE_WIDTH, 'PCX width');
  assertLimit(height, MAX_IMAGE_HEIGHT, 'PCX height');
  assertLimit(width * height, MAX_IMAGE_PIXELS, 'PCX pixel count');
  const layout = `${h.bpp}x${h.planes}`;
  if (!LAYOUTS.has(layout)) throw new ExhumeError('unsupported PCX layout', 'pcx');

  if (![0, 2, 3, 4, 5].includes(h.version)) warnings.push({ message: `unknown PCX version ${h.version}`, offset: 1 });
  if (h.encoding === 0) warnings.push({ message: 'PCX pixel data is uncompressed (encoding 0)', offset: 2 });
  else if (h.encoding !== 1) warnings.push({ message: `unknown PCX encoding ${h.encoding}; read as RLE`, offset: 2 });
  if (h.bpp === 2) warnings.push({ message: 'CGA 4-colour PCX: fixed CGA palette 1 (high intensity) assumed', offset: 3 });

  const minBpl = Math.ceil((width * h.bpp) / 8);
  let bpl = h.bpl;
  if (bpl < minBpl) {
    warnings.push({ message: `bytesPerLine ${bpl} is too small for ${width} pixels; using ${minBpl}`, offset: 66 });
    bpl = minBpl;
  }
  const lineSize = bpl * h.planes;
  const total = lineSize * height;
  assertLimit(total, MAX_DECOMPRESSED_SIZE, 'PCX decoded size');

  // VGA palette trailer
  let dataEnd = bytes.length;
  let vga: RGB[] | undefined;
  let trailerAt = -1;
  if (layout === '8x1') {
    if (h.version === 5 && bytes.length - 769 >= HEADER && bytes[bytes.length - 769] === 0x0c) {
      trailerAt = bytes.length - 769;
      dataEnd = trailerAt;
      vga = triples(bytes.subarray(trailerAt + 1), 256);
    } else {
      warnings.push({
        message: h.version === 5 ? 'VGA palette missing at end of file; greyscale ramp used' : `PCX version ${h.version} has no VGA palette; greyscale ramp used`,
        offset: bytes.length,
      });
    }
  }

  // Pixel data -> `total` plane-interleaved scanline bytes
  let res: RleResult;
  if (h.encoding === 0) {
    const produced = Math.max(0, Math.min(total, dataEnd - HEADER));
    const out = new Uint8Array(total);
    out.set(bytes.subarray(HEADER, HEADER + produced));
    const lineEnds: number[] = [];
    for (let k = 0; k < height && (k + 1) * lineSize <= produced; k++) lineEnds.push(HEADER + (k + 1) * lineSize);
    if (produced % lineSize !== 0 && lineEnds.length < height) lineEnds.push(HEADER + produced);
    res = { out, produced, end: HEADER + produced, complete: produced >= total, lineEnds };
  } else {
    res = rleDecode(bytes, HEADER, dataEnd, total, lineSize);
  }

  r.group('pixelData', () => {
    const lines = res.lineEnds.length;
    const stride = Math.max(1, Math.ceil(lines / MAX_CHILDREN));
    let prev = HEADER;
    for (let k = 0; k < lines; k += stride) {
      const last = Math.min(k + stride, lines) - 1;
      const e = res.lineEnds[last]!;
      r.mark(stride === 1 ? `scanline ${k}` : `scanlines ${k}-${last}`, prev, e, `${e - prev} bytes`);
      prev = e;
    }
    r.seek(res.end);
  });
  if (!res.complete) {
    warnings.push({
      message: `pixel data ended after ${res.produced} of ${total} bytes (${Math.floor(res.produced / lineSize)} of ${height} scanlines); the rest is blank`,
      offset: res.end,
    });
  }
  if (trailerAt >= 0) {
    if (r.offset < trailerAt) r.skip(trailerAt - r.offset, 'slack');
    r.group('vgaPalette', () => {
      r.u8('marker');
      r.bytes(768, 'palette');
    });
  } else if (r.remaining > 0) {
    r.skip(r.remaining, 'slack');
  }

  // Compose pixels
  const d = res.out;
  const n = width * height;
  let pixels: Uint8Array;
  let palette: RGB[] | undefined;
  let bitsPerPixel: 1 | 4 | 8 | 24;
  const egaPal = triples(h.ega, 16);
  switch (layout) {
    case '1x1': {
      pixels = new Uint8Array(n);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) pixels[y * width + x] = (d[y * lineSize + (x >> 3)]! >> (7 - (x & 7))) & 1;
      }
      const [p0, p1] = [egaPal[0]!, egaPal[1]!];
      const differ = p0[0] !== p1[0] || p0[1] !== p1[1] || p0[2] !== p1[2];
      palette = differ ? [p0, p1] : [[0, 0, 0], [255, 255, 255]];
      bitsPerPixel = 1;
      break;
    }
    case '1x4': {
      pixels = new Uint8Array(n);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let v = 0;
          for (let p = 0; p < 4; p++) v |= ((d[y * lineSize + p * bpl + (x >> 3)]! >> (7 - (x & 7))) & 1) << p;
          pixels[y * width + x] = v;
        }
      }
      palette = egaPal;
      bitsPerPixel = 4;
      break;
    }
    case '4x1': {
      pixels = new Uint8Array(n);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const b = d[y * lineSize + (x >> 1)]!;
          pixels[y * width + x] = x & 1 ? b & 15 : b >> 4;
        }
      }
      palette = egaPal;
      bitsPerPixel = 4;
      break;
    }
    case '2x1': {
      pixels = new Uint8Array(n);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) pixels[y * width + x] = (d[y * lineSize + (x >> 2)]! >> (6 - 2 * (x & 3))) & 3;
      }
      palette = CGA.map((c): RGB => [c[0], c[1], c[2]]);
      bitsPerPixel = 4;
      break;
    }
    case '8x1': {
      pixels = new Uint8Array(n);
      for (let y = 0; y < height; y++) pixels.set(d.subarray(y * lineSize, y * lineSize + width), y * width);
      palette = vga ?? Array.from({ length: 256 }, (_, i): RGB => [i, i, i]);
      bitsPerPixel = 8;
      break;
    }
    default: {
      pixels = new Uint8Array(n * 3);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let p = 0; p < 3; p++) pixels[(y * width + x) * 3 + p] = d[y * lineSize + p * bpl + x]!;
        }
      }
      bitsPerPixel = 24;
    }
  }

  const payload: ImagePayload = { kind: 'image', width, height, bitsPerPixel, pixels };
  if (palette) payload.palette = palette;
  return { payload, annotations: r.annotations(), warnings, meta: { width, height, bitsPerPixel } };
}
