// PackBits example tests

import { describe, it, expect } from 'vitest';
import { decodePack, encodePack } from './packbits.js';

describe('decodePack', () => {
  it('decodes literal run', () => {
    // [2, 0x01, 0x02, 0x03] = literal run of 3 bytes: 0x01, 0x02, 0x03
    const encoded = new Uint8Array([2, 0x01, 0x02, 0x03]);
    const decoded = decodePack(encoded, 100);
    expect(decoded).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
  });

  it('decodes repeat run', () => {
    // [254, 0x42] = repeat byte 0x42 3 times (257 - 254 = 3)
    const encoded = new Uint8Array([254, 0x42]);
    const decoded = decodePack(encoded, 100);
    expect(decoded).toEqual(new Uint8Array([0x42, 0x42, 0x42]));
  });

  it('handles no-op byte (128)', () => {
    // [128] is a no-op, followed by valid encoded data
    // 0x01, 0x42, 0x43 = literal run of 2 bytes: 0x42, 0x43
    const encoded = new Uint8Array([128, 1, 0x42, 0x43]);
    const decoded = decodePack(encoded, 100);
    expect(decoded).toEqual(new Uint8Array([0x42, 0x43]));
  });

  it('stops at maxOut', () => {
    // [254, 0x42] repeated 3 times would give 9 bytes, but maxOut=5
    const encoded = new Uint8Array([254, 0x42, 254, 0x42, 254, 0x42]);
    const decoded = decodePack(encoded, 5);
    expect(decoded).toEqual(new Uint8Array([0x42, 0x42, 0x42, 0x42, 0x42]));
  });

  it('throws on truncated literal run', () => {
    // [2, 0x01] wants 3 bytes but only 1 follows
    const encoded = new Uint8Array([2, 0x01]);
    expect(() => decodePack(encoded, 100)).toThrow('PackBits');
  });

  it('throws on truncated repeat run', () => {
    // [254] wants 1 byte but none follow
    const encoded = new Uint8Array([254]);
    expect(() => decodePack(encoded, 100)).toThrow('PackBits');
  });

  it('handles empty input', () => {
    const encoded = new Uint8Array([]);
    const decoded = decodePack(encoded, 100);
    expect(decoded).toEqual(new Uint8Array([]));
  });
});

describe('encodePack', () => {
  it('encodes literal bytes', () => {
    const src = new Uint8Array([0x01, 0x02, 0x03]);
    const encoded = encodePack(src);
    // Three literal bytes: [2, 0x01, 0x02, 0x03]
    expect(encoded).toEqual(new Uint8Array([2, 0x01, 0x02, 0x03]));
  });

  it('encodes repeated bytes', () => {
    const src = new Uint8Array([0x42, 0x42, 0x42]);
    const encoded = encodePack(src);
    // Three repeats: [254, 0x42] (257 - 254 = 3)
    expect(encoded).toEqual(new Uint8Array([254, 0x42]));
  });

  it('encodes single byte', () => {
    const src = new Uint8Array([0x42]);
    const encoded = encodePack(src);
    // Single literal encoded as run of 1: [0, 0x42]
    expect(encoded).toEqual(new Uint8Array([0, 0x42]));
  });

  it('encodes two repeated bytes as literals', () => {
    const src = new Uint8Array([0x42, 0x42]);
    const encoded = encodePack(src);
    // Two repeats are encoded as two literals: [1, 0x42, 0x42]
    expect(encoded).toEqual(new Uint8Array([1, 0x42, 0x42]));
  });

  it('handles alternating pattern', () => {
    const src = new Uint8Array([0x01, 0x02, 0x01, 0x02]);
    const encoded = encodePack(src);
    // Alternating pattern can be grouped into one literal run
    // [3, 0x01, 0x02, 0x01, 0x02] = literal run of 4 bytes
    expect(encoded).toEqual(new Uint8Array([3, 0x01, 0x02, 0x01, 0x02]));
  });
});

describe('encodePack with rowSize', () => {
  it('keeps runs within row boundaries', () => {
    // 8 bytes across 2 rows of 4
    const src = new Uint8Array([0x01, 0x01, 0x01, 0x02, 0x03, 0x03, 0x03, 0x04]);
    const encoded = encodePack(src, 4);
    // Row 1: [0x01, 0x01, 0x01, 0x02] -> [254, 0x01, 0, 0x02] (3 repeats + 1 literal)
    // Row 2: [0x03, 0x03, 0x03, 0x04] -> [254, 0x03, 0, 0x04]
    expect(encoded).toEqual(new Uint8Array([254, 0x01, 0, 0x02, 254, 0x03, 0, 0x04]));
  });
});
