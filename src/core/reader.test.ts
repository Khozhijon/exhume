// ByteReader example tests

import { describe, it, expect, assert } from 'vitest';
import { ByteReader } from './reader.js';
import { ExhumeError } from './types.js';

describe('ByteReader', () => {
  describe('u8', () => {
    it('reads a single byte', () => {
      const reader = new ByteReader(new Uint8Array([0x42]));
      expect(reader.u8('value')).toBe(0x42);
      expect(reader.offset).toBe(1);
    });

    it('reads multiple bytes sequentially', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0x03]));
      expect(reader.u8('a')).toBe(0x01);
      expect(reader.u8('b')).toBe(0x02);
      expect(reader.u8('c')).toBe(0x03);
    });

    it('throws on bounds', () => {
      const reader = new ByteReader(new Uint8Array([0x01]));
      expect(() => reader.u8('value')).not.toThrow();
      expect(() => reader.u8('value')).toThrow(ExhumeError);
    });
  });

  describe('u16le', () => {
    it('reads little-endian 16-bit', () => {
      const reader = new ByteReader(new Uint8Array([0x34, 0x12]));
      expect(reader.u16le('value')).toBe(0x1234);
    });

    it('throws on insufficient bytes', () => {
      const reader = new ByteReader(new Uint8Array([0x01]));
      expect(() => reader.u16le('value')).toThrow(ExhumeError);
    });
  });

  describe('u16be', () => {
    it('reads big-endian 16-bit', () => {
      const reader = new ByteReader(new Uint8Array([0x12, 0x34]));
      expect(reader.u16be('value')).toBe(0x1234);
    });
  });

  describe('u32le', () => {
    it('reads little-endian 32-bit', () => {
      const reader = new ByteReader(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
      expect(reader.u32le('value')).toBe(0x12345678);
    });
  });

  describe('u32be', () => {
    it('reads big-endian 32-bit', () => {
      const reader = new ByteReader(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
      expect(reader.u32be('value')).toBe(0x12345678);
    });
  });

  describe('i8', () => {
    it('reads signed 8-bit (positive)', () => {
      const reader = new ByteReader(new Uint8Array([0x42]));
      expect(reader.i8('value')).toBe(66);
    });

    it('reads signed 8-bit (negative)', () => {
      const reader = new ByteReader(new Uint8Array([0xfe])); // -2 in 8-bit signed
      expect(reader.i8('value')).toBe(-2);
    });
  });

  describe('i16le', () => {
    it('reads signed little-endian 16-bit (positive)', () => {
      const reader = new ByteReader(new Uint8Array([0x34, 0x12]));
      expect(reader.i16le('value')).toBe(0x1234);
    });

    it('reads signed little-endian 16-bit (negative)', () => {
      const reader = new ByteReader(new Uint8Array([0xfe, 0xff])); // -2 in 16-bit signed
      expect(reader.i16le('value')).toBe(-2);
    });
  });

  describe('i32le', () => {
    it('reads signed little-endian 32-bit', () => {
      const reader = new ByteReader(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
      expect(reader.i32le('value')).toBe(0x12345678);
    });

    it('reads negative 32-bit', () => {
      const reader = new ByteReader(new Uint8Array([0xfe, 0xff, 0xff, 0xff]));
      expect(reader.i32le('value')).toBe(-2);
    });
  });

  describe('f64le', () => {
    it('reads little-endian 64-bit float', () => {
      const writer = new ArrayBuffer(8);
      new DataView(writer).setFloat64(0, 3.14159, true);
      const bytes = new Uint8Array(writer);
      const reader = new ByteReader(bytes);
      expect(reader.f64le('pi')).toBeCloseTo(3.14159, 5);
    });
  });

  describe('bytes', () => {
    it('reads n bytes as view', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const reader = new ByteReader(data);
      const result = reader.bytes(2, 'data');
      expect(result).toEqual(new Uint8Array([0x01, 0x02]));
      expect(result.buffer).toBe(data.buffer);
    });

    it('throws on insufficient bytes', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02]));
      expect(() => reader.bytes(4, 'data')).toThrow(ExhumeError);
    });
  });

  describe('nullString', () => {
    it('reads null-terminated string', () => {
      const reader = new ByteReader(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00]));
      expect(reader.nullString('greeting')).toBe('Hello');
    });

    it('reads string up to maxLen without null', () => {
      const reader = new ByteReader(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00]));
      expect(reader.nullString('greeting', 3)).toBe('Hel');
    });

    it('consumes the null terminator', () => {
      const reader = new ByteReader(new Uint8Array([0x41, 0x00, 0x42]));
      reader.nullString('a');
      expect(reader.u8('b')).toBe(0x42);
    });
  });

  describe('group', () => {
    it('creates nested annotations', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
      reader.group('header', () => {
        reader.u8('field1');
        reader.group('nested', () => {
          reader.u8('field2');
        });
      });
      reader.u8('footer');

      const anns = reader.annotations();
      expect(anns).toHaveLength(2); // header and footer
      expect(anns[0]!.label).toBe('header');
      expect(anns[0]!.children!).toHaveLength(2); // field1 and nested
      expect(anns[0]!.children![0]!.label).toBe('field1');
      expect(anns[0]!.children![1]!.label).toBe('nested');
      expect(anns[0]!.children![1]!.children!).toHaveLength(1);
      expect(anns[0]!.children![1]!.children![0]!.label).toBe('field2');
    });
  });

  describe('skip', () => {
    it('advances offset without reading', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
      reader.skip(2, 'padding');
      expect(reader.offset).toBe(2);
      expect(reader.u8('value')).toBe(0x03);
    });

    it('throws on insufficient bytes', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02]));
      expect(() => reader.skip(4, 'padding')).toThrow(ExhumeError);
    });
  });

  describe('seek', () => {
    it('jumps to absolute offset', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
      reader.seek(2);
      expect(reader.offset).toBe(2);
      expect(reader.u8('value')).toBe(0x03);
    });

    it('accepts seek(0)', () => {
      const reader = new ByteReader(new Uint8Array([0x01]));
      reader.u8('a');
      expect(reader.offset).toBe(1);
      reader.seek(0);
      expect(reader.offset).toBe(0);
      expect(reader.u8('b')).toBe(0x01);
    });

    it('throws on negative offset', () => {
      const reader = new ByteReader(new Uint8Array([0x01]));
      expect(() => reader.seek(-1)).toThrow(ExhumeError);
    });

    it('throws on offset beyond file', () => {
      const reader = new ByteReader(new Uint8Array([0x01]));
      expect(() => reader.seek(5)).toThrow(ExhumeError);
    });
  });

  describe('annotations', () => {
    it('returns collected annotations', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0x03]));
      reader.u8('a');
      reader.u8('b');
      reader.u8('c');

      const anns = reader.annotations();
      expect(anns).toHaveLength(3);
      expect(anns[0]!.label).toBe('a');
      expect(anns[0]!.start).toBe(0);
      expect(anns[0]!.end).toBe(1);
      expect(anns[1]!.label).toBe('b');
      expect(anns[1]!.start).toBe(1);
      expect(anns[1]!.end).toBe(2);
    });

    it('annotations cover entire file without gaps or overlaps', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
      const reader = new ByteReader(data);
      reader.u8('a');
      reader.u8('b');
      reader.u8('c');
      reader.u8('d');
      reader.u8('e');

      const anns = reader.annotations();

      // Check coverage
      const covered = new Array(5).fill(false);
      for (const ann of anns) {
        for (let i = ann.start; i < ann.end; i++) {
          covered[i] = true;
        }
      }
      expect(covered).toEqual([true, true, true, true, true]);

      // Check no overlaps
      const byteToAnns: number[][] = [[], [], [], [], []];
      for (const ann of anns) {
        for (let i = ann.start; i < ann.end; i++) {
          byteToAnns[i]!.push(ann.start);
        }
      }
      for (let i = 0; i < byteToAnns.length; i++) {
        expect(byteToAnns[i]!).toHaveLength(1);
      }
    });
  });

  describe('remaining', () => {
    it('decreases with reads', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0x03]));
      expect(reader.remaining).toBe(3);
      reader.u8('a');
      expect(reader.remaining).toBe(2);
      reader.u8('b');
      expect(reader.remaining).toBe(1);
    });
  });

  describe('u32le', () => {
    it('reads 0xFFFFFFFF correctly (unsigned)', () => {
      const reader = new ByteReader(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
      expect(reader.u32le('value')).toBe(0xffffffff);
    });

    it('reads 0x80000000 correctly (unsigned)', () => {
      const reader = new ByteReader(new Uint8Array([0x00, 0x00, 0x00, 0x80]));
      expect(reader.u32le('value')).toBe(0x80000000);
    });
  });

  describe('u32be', () => {
    it('reads 0xFFFFFFFF correctly (unsigned)', () => {
      const reader = new ByteReader(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
      expect(reader.u32be('value')).toBe(0xffffffff);
    });

    it('reads 0x80000000 correctly (unsigned)', () => {
      const reader = new ByteReader(new Uint8Array([0x80, 0x00, 0x00, 0x00]));
      expect(reader.u32be('value')).toBe(0x80000000);
    });
  });

  describe('nullString', () => {
    it('handles unterminated string at end of buffer', () => {
      const reader = new ByteReader(new Uint8Array([0x41, 0x42, 0x43]));
      const result = reader.nullString('str', 10);
      expect(result).toBe('ABC');
      expect(reader.offset).toBe(3);
    });

    it('respects maxLen without NUL terminator', () => {
      const reader = new ByteReader(new Uint8Array([0x41, 0x42, 0x43, 0x44]));
      const result = reader.nullString('str', 2);
      expect(result).toBe('AB');
      expect(reader.offset).toBe(2);
      // Next byte should still be readable
      expect(reader.u8('next')).toBe(0x43);
    });
  });

  describe('bytes', () => {
    it('throws on negative n', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02]));
      expect(() => reader.bytes(-1, 'data')).toThrow(ExhumeError);
    });

    it('throws on non-integer n', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02]));
      expect(() => reader.bytes(1.5, 'data')).toThrow(ExhumeError);
    });
  });

  describe('skip', () => {
    it('throws on negative n', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02]));
      expect(() => reader.skip(-1, 'padding')).toThrow(ExhumeError);
    });

    it('throws on non-integer n', () => {
      const reader = new ByteReader(new Uint8Array([0x01, 0x02]));
      expect(() => reader.skip(1.5, 'padding')).toThrow(ExhumeError);
    });
  });
});
