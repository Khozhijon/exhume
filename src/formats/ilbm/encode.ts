// Canonical ILBM writer: BMHD, CMAP, CAMG, ByteRun1 BODY.
import { encodePack } from '../../core/packbits.js';
import { ByteWriter } from '../../core/writer.js';
import { ExhumeError } from '../../core/types.js';
import type { ImagePayload, SpecimenPayload } from '../../core/types.js';
import { rowBytesFor } from './body.js';

const FMT = 'ilbm';

function writeId(w: ByteWriter, id: string): void {
  for (let i = 0; i < 4; i++) w.writeU8(id.charCodeAt(i));
}

function chunk(out: ByteWriter, id: string, data: Uint8Array): void {
  writeId(out, id);
  out.writeU32be(data.length);
  out.writeBytes(data);
  if (data.length & 1) out.writeU8(0);
}

/** Planar rows: for each image row, nPlanes plane rows; the whole body is then ByteRun1 packed per row. */
function planarBody(pixels: Uint8Array, width: number, height: number, nPlanes: number): Uint8Array {
  const rb = rowBytesFor(width);
  const raw = new Uint8Array(height * nPlanes * rb);
  const rgb = nPlanes === 24;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = 0x80 >> (x & 7);
      const bi = x >> 3;
      for (let q = 0; q < nPlanes; q++) {
        const v = rgb ? pixels[(y * width + x) * 3 + (q >> 3)]! >> (q & 7) : pixels[y * width + x]! >> q;
        if (v & 1) raw[(y * nPlanes + q) * rb + bi]! |= bit;
      }
    }
  }
  return encodePack(raw, rb);
}

/**
 * Fewest bit planes that hold the picture and still decode to the same model: 1 for 1 bpp, 2..4 for
 * 4 bpp, 5..8 for 8 bpp (a 32-colour picture is written with 5 planes, as an Amiga would).
 * 6 planes with a 32-entry CMAP would be read back as extra-half-brite, so that case uses 7.
 */
function planesFor(model: ImagePayload): number {
  const { bitsPerPixel: bpp, palette, pixels } = model;
  if (bpp === 24) return 24;
  if (bpp === 1) return 1;
  let max = (palette?.length ?? 1) - 1;
  for (let i = 0; i < pixels.length; i++) if (pixels[i]! > max) max = pixels[i]!;
  const need = Math.max(1, 32 - Math.clz32(max));
  let n = Math.max(bpp === 4 ? 2 : 5, need);
  if (n === 6 && palette?.length === 32) n = 7;
  return Math.min(n, bpp === 4 ? 4 : 8);
}

export function encode(model: SpecimenPayload): Uint8Array {
  if (model.kind !== 'image') throw new ExhumeError('ILBM can only encode images', FMT);
  const { width, height, bitsPerPixel: bpp, palette, pixels } = model;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
    throw new ExhumeError(`cannot encode ILBM of ${width}x${height}`, FMT);
  }
  const rgb = bpp === 24;
  if (pixels.length !== width * height * (rgb ? 3 : 1)) throw new ExhumeError('pixel buffer does not match width * height', FMT);

  const bmhd = new ByteWriter();
  bmhd.writeU16be(width);
  bmhd.writeU16be(height);
  bmhd.writeU16be(0);
  bmhd.writeU16be(0);
  const nPlanes = planesFor(model);
  bmhd.writeU8(nPlanes);
  bmhd.writeU8(0); // masking: none
  bmhd.writeU8(1); // compression: ByteRun1
  bmhd.writeU8(0);
  bmhd.writeU16be(0);
  bmhd.writeU8(1);
  bmhd.writeU8(1);
  bmhd.writeU16be(Math.min(width, 32767));
  bmhd.writeU16be(Math.min(height, 32767));

  const body = new ByteWriter();
  chunk(body, 'BMHD', bmhd.toUint8Array());
  if (!rgb && palette && palette.length > 0) {
    const cmap = new Uint8Array(palette.length * 3);
    palette.forEach((c, i) => cmap.set(c, i * 3));
    chunk(body, 'CMAP', cmap);
  }
  if (!rgb) {
    const camg = new ByteWriter();
    camg.writeU32be(0);
    chunk(body, 'CAMG', camg.toUint8Array());
  }
  chunk(body, 'BODY', planarBody(pixels, width, height, nPlanes));

  const out = new ByteWriter();
  writeId(out, 'FORM');
  out.writeU32be(body.length + 4);
  writeId(out, 'ILBM');
  out.writeBytes(body.toUint8Array());
  return out.toUint8Array();
}
