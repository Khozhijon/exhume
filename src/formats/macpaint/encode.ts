// MacPaint encoder: canonical file, version 2, no MacBinary wrapper, rows PackBits-compressed one by one.
import { encodePack } from '../../core/packbits.js';
import { ByteWriter } from '../../core/writer.js';
import { ExhumeError } from '../../core/types.js';
import type { SpecimenPayload } from '../../core/types.js';
import { BITMAP_BYTES, HEADER_BYTES, HEIGHT, PATTERN_COUNT, ROW_BYTES, WIDTH } from './decode.js';

export function encode(model: SpecimenPayload): Uint8Array {
  if (model.kind !== 'image' || model.width !== WIDTH || model.height !== HEIGHT || model.pixels.length !== WIDTH * HEIGHT) {
    throw new ExhumeError('MacPaint needs a 576x720 image', 'macpaint');
  }
  const w = new ByteWriter();
  w.writeU32be(2);
  for (let i = 0; i < PATTERN_COUNT; i++) {
    const p = model.patterns?.[i];
    for (let k = 0; k < 8; k++) w.writeU8(p?.[k] ?? 0);
  }
  while (w.length < HEADER_BYTES) w.writeU8(0);

  const packed = new Uint8Array(BITMAP_BYTES);
  const px = model.pixels;
  for (let i = 0; i < BITMAP_BYTES; i++) {
    let v = 0;
    for (let k = 0; k < 8; k++) v = (v << 1) | (px[i * 8 + k]! & 1);
    packed[i] = v;
  }
  w.writeBytes(encodePack(packed, ROW_BYTES));
  return w.toUint8Array();
}
