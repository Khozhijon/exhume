// PCX encoder. The layout is chosen from the model's bitsPerPixel:
//   1  -> 1 bit x 1 plane (monochrome), header palette entries 0,1 = palette[0], palette[1]
//   4  -> 1 bit x 4 planes (EGA planar, plane 0 = LSB), header palette = 16 entries
//   8  -> 8 bit x 1 plane, version 5, 256-entry VGA palette trailer (0x0C + 768 bytes)
//   24 -> 8 bit x 3 planes (R, G, B), version 5, no palette
// Round trip stays exact because palettes are always written in full and decoded at a fixed length
// for the depth (2, 16 or 256 entries; none for 24). Valid models therefore carry a palette of
// exactly that length (the encoder pads with black / truncates otherwise), and a 1bpp model needs
// palette[0] != palette[1] (equal entries are what writers leave when the palette is unused, and the
// decoder reads them as the default black/white).
import { ByteWriter } from '../../core/writer.js';
import { ExhumeError } from '../../core/types.js';
import type { SpecimenPayload } from '../../core/types.js';
import { rleEncode } from './rle.js';

export const PALETTE_LEN: Record<number, number> = { 1: 2, 4: 16, 8: 256 };

/** Bytes per plane scanline (even), as PC Paintbrush wrote it. */
export function lineBytes(width: number, bitsPerPixel: number): number {
  const n = Math.ceil((width * bitsPerPixel) / 8);
  return n + (n & 1);
}

export function encode(model: SpecimenPayload): Uint8Array {
  if (model.kind !== 'image') throw new ExhumeError('PCX needs an image', 'pcx');
  const { width, height, bitsPerPixel: depth, pixels } = model;
  if (![1, 4, 8, 24].includes(depth)) throw new ExhumeError(`PCX cannot store ${depth} bits per pixel`, 'pcx');
  if (width < 1 || height < 1 || width > 0xffff || height > 0xffff) throw new ExhumeError('PCX size out of range', 'pcx');
  const channels = depth === 24 ? 3 : 1;
  if (pixels.length !== width * height * channels) throw new ExhumeError('PCX pixel count does not match the size', 'pcx');

  const planes = depth === 4 ? 4 : depth === 24 ? 3 : 1;
  const bpp = depth === 24 ? 8 : depth === 4 ? 1 : depth;
  const bpl = lineBytes(width, depth === 24 ? 8 : depth === 4 ? 1 : depth);
  const palette = model.palette ?? [];
  const palLen = PALETTE_LEN[depth] ?? 0;
  const pal = (i: number): [number, number, number] => palette[i] ?? [0, 0, 0];

  const w = new ByteWriter();
  w.writeU8(0x0a);
  w.writeU8(depth >= 8 ? 5 : 2);
  w.writeU8(1);
  w.writeU8(bpp);
  w.writeU16le(0);
  w.writeU16le(0);
  w.writeU16le(width - 1);
  w.writeU16le(height - 1);
  w.writeU16le(72);
  w.writeU16le(72);
  for (let i = 0; i < 16; i++) {
    const c = depth === 1 || depth === 4 ? (i < palLen ? pal(i) : [0, 0, 0]) : [0, 0, 0];
    for (const v of c) w.writeU8(v);
  }
  w.writeU8(0);
  w.writeU8(planes);
  w.writeU16le(bpl);
  w.writeU16le(1);
  w.writeU16le(width);
  w.writeU16le(height);
  for (let i = 0; i < 54; i++) w.writeU8(0);

  const line = new Uint8Array(planes * bpl);
  const all = new Uint8Array(line.length * height);
  for (let y = 0; y < height; y++) {
    line.fill(0);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (depth === 1) {
        line[x >> 3] = line[x >> 3]! | ((pixels[row + x]! & 1) << (7 - (x & 7)));
      } else if (depth === 4) {
        const v = pixels[row + x]! & 15;
        for (let p = 0; p < 4; p++) line[p * bpl + (x >> 3)] = line[p * bpl + (x >> 3)]! | (((v >> p) & 1) << (7 - (x & 7)));
      } else if (depth === 8) {
        line[x] = pixels[row + x]!;
      } else {
        for (let p = 0; p < 3; p++) line[p * bpl + x] = pixels[(row + x) * 3 + p]!;
      }
    }
    all.set(line, y * line.length);
  }
  w.writeBytes(rleEncode(all, line.length));
  if (depth === 8) {
    w.writeU8(0x0c);
    for (let i = 0; i < 256; i++) for (const v of pal(i)) w.writeU8(v);
  }
  return w.toUint8Array();
}
