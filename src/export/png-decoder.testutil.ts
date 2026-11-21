import { expect } from 'vitest';
import { unzlibSync } from 'fflate';
import { crc32 } from './png.js';

export interface Decoded {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  palette: [number, number, number][];
  pixels: Uint8Array; // one byte per index (palette) or RGB triples
  chunks: string[];
}

const be32 = (b: Uint8Array, o: number) => (((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0)) >>> 0;

export function decodePngInTest(png: Uint8Array): Decoded {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  sig.forEach((v, i) => expect(png[i]).toBe(v));
  let o = 8;
  const idat: Uint8Array[] = [];
  const palette: [number, number, number][] = [];
  const chunks: string[] = [];
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  while (o < png.length) {
    const len = be32(png, o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    expect(be32(png, o + 8 + len)).toBe(crc32(png.subarray(o + 4, o + 8 + len)));
    chunks.push(type);
    if (type === 'IHDR') {
      width = be32(data, 0);
      height = be32(data, 4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      expect([data[10], data[11], data[12]]).toEqual([0, 0, 0]);
    } else if (type === 'PLTE') {
      for (let i = 0; i < len; i += 3) palette.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
    } else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const total = idat.reduce((s, d) => s + d.length, 0);
  const z = new Uint8Array(total);
  let p = 0;
  for (const d of idat) { z.set(d, p); p += d.length; }
  const raw = unzlibSync(z);
  const spp = colorType === 2 ? 3 : 1;
  const rowBytes = Math.ceil((width * spp * bitDepth) / 8);
  expect(raw.length).toBe((rowBytes + 1) * height);
  const pixels = new Uint8Array(width * height * spp);
  for (let y = 0; y < height; y++) {
    const base = y * (rowBytes + 1);
    expect(raw[base]).toBe(0);
    for (let x = 0; x < width * spp; x++) {
      pixels[y * width * spp + x] =
        bitDepth === 1 ? ((raw[base + 1 + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1 : raw[base + 1 + x] ?? 0;
    }
  }
  return { width, height, bitDepth, colorType, palette, pixels, chunks };
}

