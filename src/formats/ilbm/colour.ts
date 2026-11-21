// ILBM colour helpers: grey ramp, EHB palette expansion, HAM6 conversion.

export type Rgb = [number, number, number];

/** `n` greys from black to white (n >= 2). */
export function greyRamp(n: number): Rgb[] {
  const out: Rgb[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.round((i * 255) / Math.max(1, n - 1));
    out.push([v, v, v]);
  }
  return out;
}

/** Extra half-brite: the first 32 colours (black-padded) followed by the same colours at half brightness. */
export function ehbPalette(cmap: readonly Rgb[]): Rgb[] {
  const base: Rgb[] = [];
  for (let i = 0; i < 32; i++) base.push(cmap[i] ? [cmap[i]![0], cmap[i]![1], cmap[i]![2]] : [0, 0, 0]);
  return [...base, ...base.map((c): Rgb => [c[0] >> 1, c[1] >> 1, c[2] >> 1])];
}

/**
 * HAM6: `indices` holds one 6-bit value per pixel. Top two bits: 00 palette colour (low 4 bits),
 * 01 set blue, 10 set red, 11 set green to low4 * 17. Every row starts from palette colour 0.
 */
export function hamToRgb(indices: Uint8Array, width: number, height: number, palette: readonly Rgb[]): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  const colour = (i: number): Rgb => palette[i] ?? [0, 0, 0];
  for (let y = 0; y < height; y++) {
    let [r, g, b] = colour(0);
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x]!;
      const level = (v & 15) * 17;
      switch (v >> 4) {
        case 0:
          [r, g, b] = colour(v & 15);
          break;
        case 1:
          b = level;
          break;
        case 2:
          r = level;
          break;
        default:
          g = level;
      }
      const o = (y * width + x) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  return out;
}
