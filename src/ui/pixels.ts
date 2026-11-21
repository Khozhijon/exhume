// Turn a decoded ImagePayload into RGBA for a canvas. Display only: the payload is never changed.
import type { ImagePayload } from '../core/types.js';

export function toRgba(image: ImagePayload): Uint8ClampedArray {
  const { width, height, pixels, palette } = image;
  const out = new Uint8ClampedArray(width * height * 4);
  if (image.bitsPerPixel === 24) {
    for (let i = 0, o = 0; i < width * height; i++, o += 4) {
      out[o] = pixels[i * 3] ?? 0;
      out[o + 1] = pixels[i * 3 + 1] ?? 0;
      out[o + 2] = pixels[i * 3 + 2] ?? 0;
      out[o + 3] = 255;
    }
    return out;
  }
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    const index = pixels[i] ?? 0;
    const c = palette?.[index];
    const grey = image.bitsPerPixel === 1 ? (index ? 0 : 255) : index;
    out[o] = c ? c[0] : grey;
    out[o + 1] = c ? c[1] : grey;
    out[o + 2] = c ? c[2] : grey;
    out[o + 3] = 255;
  }
  return out;
}
