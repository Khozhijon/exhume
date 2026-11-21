// PackBits / ByteRun1 codec (used by MacPaint, ILBM)

import { ExhumeError } from './types.js';

/**
 * Decode a PackBits / ByteRun1 stream.
 * Stops after emitting maxOut bytes; ignores trailing input.
 * Throws ExhumeError if the stream is structurally invalid (not merely truncated).
 */
export function decodePack(src: Uint8Array, maxOut: number): Uint8Array {
  const out: number[] = [];
  let i = 0;

  while (out.length < maxOut && i < src.length) {
    const byte = src[i++]!;
    if (byte >= 0 && byte <= 127) {
      // Literal run: next n+1 bytes are literal
      const len = byte + 1;
      if (i + len > src.length) {
        throw new ExhumeError(
          `PackBits: literal run at offset ${i - 1} needs ${len} bytes but only ${src.length - i} remaining`,
        );
      }
      for (let j = 0; j < len && out.length < maxOut; j++) {
        const val = src[i++]!;
        if (val < 0 || val > 255 || !Number.isInteger(val)) {
          throw new ExhumeError(
            `PackBits: literal byte at offset ${i - 1} is out of range: ${val}`,
          );
        }
        out.push(val);
      }
    } else if (byte >= 129 && byte <= 255) {
      // Repeat run: next byte repeated (257 - n) times
      const repeat = 257 - byte;
      if (i >= src.length) {
        throw new ExhumeError(
          `PackBits: repeat run at offset ${i - 1} needs 1 byte but 0 remaining`,
        );
      }
      const val = src[i++]!;
      if (val < 0 || val > 255 || !Number.isInteger(val)) {
        throw new ExhumeError(
          `PackBits: repeat byte at offset ${i - 1} is out of range: ${val}`,
        );
      }
      for (let j = 0; j < repeat && out.length < maxOut; j++) {
        out.push(val);
      }
    } else if (byte === 128) {
      // No-op
      // According to spec, this terminates the stream in some implementations
      // but we just ignore it and continue for robustness
    } else {
      // byte === 128 is handled above, so this shouldn't happen
      // but if it does, it's invalid
      throw new ExhumeError(
        `PackBits: invalid opcode at offset ${i - 1}: ${byte}`,
      );
    }
  }

  return new Uint8Array(out);
}

/**
 * Encode src with PackBits.
 * Canonical: compress row by row when rowSize is provided; otherwise treats src as one row.
 * Runs never cross row boundaries.
 */
export function encodePack(src: Uint8Array, rowSize?: number): Uint8Array {
  const out: number[] = [];
  const rows = rowSize ? Math.ceil(src.length / rowSize) : 1;

  for (let r = 0; r < rows; r++) {
    const rs = rowSize ?? src.length;
    const start = r * rs;
    const end = Math.min(start + rs, src.length);
    const row = src.subarray(start, end);

    let i = 0;
    while (i < row.length) {
      const literalStart = i;
      // Find literal run
      while (i < row.length) {
        // Look ahead for repeat
        if (i + 2 < row.length && row[i] === row[i + 1] && row[i] === row[i + 2]) {
          break;
        }
        i++;
      }
      const literalLen = i - literalStart;
      if (literalLen > 0) {
        if (literalLen === 1) {
          // Single literal byte - encode as run of 1
          out.push(0);
          out.push(row[literalStart]!);
        } else if (literalLen <= 128) {
          out.push(literalLen - 1);
          for (let j = 0; j < literalLen; j++) {
            out.push(row[literalStart + j]!);
          }
        } else {
          // Run longer than 128, split into multiple
          let remaining = literalLen;
          while (remaining > 0) {
            const chunk = Math.min(remaining, 128);
            out.push(chunk - 1);
            for (let j = 0; j < chunk; j++) {
              out.push(row[literalStart + literalLen - remaining + j]!);
            }
            remaining -= chunk;
          }
        }
      }

      // Find repeat run
      let repeatStart = i;
      if (i < row.length) {
        const val = row[i]!;
        while (i < row.length && row[i] === val) {
          i++;
        }
        const repeatLen = i - repeatStart;
        if (repeatLen > 0) {
          if (repeatLen === 1) {
            // Single repeat byte - encode as literal run of 1
            out.push(0);
            out.push(val);
          } else if (repeatLen === 2) {
            // Two repeat bytes - encode as two literals
            out.push(1);
            out.push(val);
            out.push(val);
          } else {
            // Encode as repeat run (max 128 repetitions)
            let remaining = repeatLen;
            while (remaining > 0) {
              const chunk = Math.min(remaining, 128);
              out.push(257 - chunk);
              out.push(val);
              remaining -= chunk;
            }
          }
        }
      }
    }
  }

  return new Uint8Array(out);
}

/** Result of a lenient decode: never throws, reports how far it got. */
export interface UnpackResult {
  /** Exactly `maxOut` bytes; positions the input did not reach are left as 0. */
  out: Uint8Array;
  /** Number of output bytes actually produced from the input. */
  produced: number;
  /** Number of input bytes consumed. */
  consumed: number;
  /** True when `maxOut` bytes were produced. False means the input ended early. */
  complete: boolean;
}

/**
 * Lenient PackBits / ByteRun1 decode for damaged files: decodes from `src[from]` until `maxOut` bytes
 * are produced or the input runs out, and never throws. Decoders use this so a truncated file still
 * yields the rows it does contain.
 */
export function unpackBits(src: Uint8Array, maxOut: number, from = 0): UnpackResult {
  const out = new Uint8Array(maxOut);
  let o = 0;
  let i = from;
  while (o < maxOut && i < src.length) {
    const n = src[i++]!;
    if (n < 128) {
      let len = n + 1;
      while (len-- > 0 && o < maxOut && i < src.length) out[o++] = src[i++]!;
      if (len >= 0 && o < maxOut && i >= src.length) break; // literal cut short by end of input
    } else if (n > 128) {
      if (i >= src.length) break;
      const v = src[i++]!;
      let len = 257 - n;
      while (len-- > 0 && o < maxOut) out[o++] = v;
    }
  }
  return { out, produced: o, consumed: i - from, complete: o >= maxOut };
}
