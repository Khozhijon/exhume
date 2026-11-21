// PackBits property tests

import fc from 'fast-check';
import { describe, it } from 'vitest';
import { decodePack, encodePack } from './packbits.js';

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe('packbits', () => {
  it('round-trip preserves data', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (arr: Uint8Array) => {
        const encoded = encodePack(arr);
        const decoded = decodePack(encoded, arr.length);
        return uint8ArraysEqual(decoded, arr);
      }),
    );
  });

  it('round-trip with rowSize preserves data', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 4096 }),
        fc.integer({ min: 1, max: 1024 }),
        (arr: Uint8Array, rowSize: number) => {
          const encoded = encodePack(arr, rowSize);
          const decoded = decodePack(encoded, arr.length);
          return uint8ArraysEqual(decoded, arr);
        },
      ),
    );
  });

  it('decode stops at maxOut', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 4096 }),
        fc.integer({ min: 0, max: 4096 }),
        (arr: Uint8Array, maxOut: number) => {
          const encoded = encodePack(arr);
          const decoded = decodePack(encoded, maxOut);
          return decoded.length <= maxOut;
        },
      ),
    );
  });
});
