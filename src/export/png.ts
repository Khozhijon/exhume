// Minimal PNG writer (no DOM, no canvas). Palette PNG for 1/4/8 bpp, truecolour for 24 bpp.
import { zlibSync } from 'fflate';
import type { ImagePayload } from '../core/types.js';

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Standard CRC-32 (the PNG / zip polynomial). */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function u32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  out.set(u32(crc32(out.subarray(4, 8 + data.length))), 8 + data.length);
  return out;
}

function buildPalette(img: ImagePayload): [number, number, number][] {
  const bpp = img.bitsPerPixel;
  const limit = bpp === 1 ? 2 : 256;
  let maxIdx = 0;
  for (let i = 0; i < img.pixels.length; i++) {
    const v = bpp === 1 ? (img.pixels[i] ?? 0) & 1 : img.pixels[i] ?? 0;
    if (v > maxIdx) maxIdx = v;
  }
  let pal: [number, number, number][];
  if (img.palette && img.palette.length > 0) {
    pal = img.palette.slice(0, limit).map(([r, g, b]) => [r & 255, g & 255, b & 255]);
  } else if (bpp === 1) {
    pal = [[255, 255, 255], [0, 0, 0]]; // MacPaint convention: 1 = black
  } else {
    const n = 1 << bpp;
    pal = Array.from({ length: n }, (_, i) => {
      const g = Math.round((i * 255) / (n - 1));
      return [g, g, g] as [number, number, number];
    });
  }
  while (pal.length < maxIdx + 1 && pal.length < limit) pal.push([0, 0, 0]);
  return pal;
}

/** Encode an ImagePayload as a PNG. Pixel values and palette are stored unchanged. */
export function encodePng(image: ImagePayload): Uint8Array {
  const { width, height, bitsPerPixel: bpp, pixels } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`encodePng: invalid size ${width}x${height}`);
  }
  const rgb = bpp === 24;
  const bitDepth = bpp === 1 ? 1 : 8;
  const rowBytes = rgb ? width * 3 : bpp === 1 ? Math.ceil(width / 8) : width;
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const dst = y * (rowBytes + 1) + 1; // filter byte 0 = None stays 0
    if (bpp === 1) {
      for (let x = 0; x < width; x++) {
        if (((pixels[y * width + x] ?? 0) & 1) !== 0) {
          const i = dst + (x >> 3);
          raw[i] = (raw[i] ?? 0) | (0x80 >> (x & 7));
        }
      }
    } else {
      const n = rgb ? width * 3 : width;
      const src = y * n;
      for (let i = 0; i < n; i++) raw[dst + i] = pixels[src + i] ?? 0;
    }
  }
  const ihdr = new Uint8Array([...u32(width), ...u32(height), bitDepth, rgb ? 2 : 3, 0, 0, 0]);
  const parts: Uint8Array[] = [new Uint8Array(SIGNATURE), chunk('IHDR', ihdr)];
  if (!rgb) {
    const pal = buildPalette(image);
    const plte = new Uint8Array(pal.length * 3);
    pal.forEach(([r, g, b], i) => plte.set([r, g, b], i * 3));
    parts.push(chunk('PLTE', plte));
  }
  parts.push(chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
