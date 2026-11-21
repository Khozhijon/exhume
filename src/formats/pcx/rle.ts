// PCX run-length codec. A byte with the two top bits set (0xC0..0xFF) is a run header: the low six
// bits are the count (0..63) and the next byte is the value. Any other byte is one literal.
// A literal value >= 0xC0 must therefore be written as a run of 1.

/**
 * Encode `src`. When `lineSize` is given, runs never cross a multiple of it (PCX scanlines);
 * otherwise `src` is one line.
 */
export function rleEncode(src: Uint8Array, lineSize?: number): Uint8Array {
  const out: number[] = [];
  const ls = lineSize && lineSize > 0 ? lineSize : Math.max(src.length, 1);
  for (let lineStart = 0; lineStart < src.length; lineStart += ls) {
    const lineEnd = Math.min(lineStart + ls, src.length);
    let i = lineStart;
    while (i < lineEnd) {
      const v = src[i]!;
      let n = 1;
      while (i + n < lineEnd && src[i + n] === v && n < 63) n++;
      if (n > 1 || v >= 0xc0) out.push(0xc0 | n);
      out.push(v);
      i += n;
    }
  }
  return new Uint8Array(out);
}

export interface RleResult {
  /** Exactly `maxOut` bytes; positions the input did not reach stay 0. */
  out: Uint8Array;
  produced: number;
  /** Absolute input offset where decoding stopped. */
  end: number;
  /** True when `maxOut` bytes were produced. */
  complete: boolean;
  /** For each output line (of `lineSize` bytes) the input offset after the opcode that completed it. */
  lineEnds: number[];
}

/**
 * Lenient decode of src[from..to) until `maxOut` bytes are produced. Never throws. Runs may cross
 * line boundaries (some writers do that); output is one continuous stream. A run header with no
 * value byte after it ends the input. Surplus run bytes beyond `maxOut` are dropped.
 */
export function rleDecode(src: Uint8Array, from: number, to: number, maxOut: number, lineSize: number): RleResult {
  const out = new Uint8Array(maxOut);
  const lineEnds: number[] = [];
  const lines = lineSize > 0 ? Math.ceil(maxOut / lineSize) : 0;
  let o = 0;
  let i = from;
  const stop = Math.min(to, src.length);
  while (o < maxOut && i < stop) {
    const b = src[i]!;
    if ((b & 0xc0) === 0xc0) {
      if (i + 1 >= stop) {
        i = stop; // dangling run header
        break;
      }
      const n = Math.min(b & 0x3f, maxOut - o);
      out.fill(src[i + 1]!, o, o + n);
      o += n;
      i += 2;
    } else {
      out[o++] = b;
      i++;
    }
    while (lineEnds.length < Math.min(lines, Math.floor(o / lineSize))) lineEnds.push(i);
  }
  if (lineSize > 0 && lineEnds.length < lines && o % lineSize !== 0) lineEnds.push(i);
  return { out, produced: o, end: i, complete: o >= maxOut, lineEnds };
}
