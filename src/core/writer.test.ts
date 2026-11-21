// ByteWriter example tests

import { describe, it, expect } from 'vitest';
import { ByteWriter } from './writer.js';

describe('ByteWriter', () => {
  describe('writeU8', () => {
    it('writes a single byte', () => {
      const writer = new ByteWriter();
      writer.writeU8(0x42);
      expect(writer.length).toBe(1);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x42]));
    });

    it('writes multiple bytes', () => {
      const writer = new ByteWriter();
      writer.writeU8(0x01);
      writer.writeU8(0x02);
      writer.writeU8(0x03);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
    });

    it('wraps value > 255', () => {
      const writer = new ByteWriter();
      writer.writeU8(0x1FF);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0xFF]));
    });
  });

  describe('writeU16le', () => {
    it('writes little-endian 16-bit', () => {
      const writer = new ByteWriter();
      writer.writeU16le(0x1234);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x34, 0x12]));
    });

    it('round-trips with DataView', () => {
      const writer = new ByteWriter();
      writer.writeU16le(0xABCD);
      const result = writer.toUint8Array();
      const view = new DataView(result.buffer);
      expect(view.getUint16(0, true)).toBe(0xABCD);
    });
  });

  describe('writeU16be', () => {
    it('writes big-endian 16-bit', () => {
      const writer = new ByteWriter();
      writer.writeU16be(0x1234);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x12, 0x34]));
    });
  });

  describe('writeU32le', () => {
    it('writes little-endian 32-bit', () => {
      const writer = new ByteWriter();
      writer.writeU32le(0x12345678);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
    });

    it('round-trips with DataView', () => {
      const writer = new ByteWriter();
      writer.writeU32le(0xDEADBEEF);
      const result = writer.toUint8Array();
      const view = new DataView(result.buffer);
      expect(view.getUint32(0, true)).toBe(0xDEADBEEF);
    });
  });

  describe('writeU32be', () => {
    it('writes big-endian 32-bit', () => {
      const writer = new ByteWriter();
      writer.writeU32be(0x12345678);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
    });
  });

  describe('writeI16le', () => {
    it('writes signed little-endian 16-bit (positive)', () => {
      const writer = new ByteWriter();
      writer.writeI16le(0x1234);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x34, 0x12]));
    });

    it('writes signed little-endian 16-bit (negative)', () => {
      const writer = new ByteWriter();
      writer.writeI16le(-2);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0xFE, 0xFF]));
    });

    it('round-trips with DataView', () => {
      const writer = new ByteWriter();
      writer.writeI16le(-1234);
      const result = writer.toUint8Array();
      const view = new DataView(result.buffer);
      expect(view.getInt16(0, true)).toBe(-1234);
    });
  });

  describe('writeI32le', () => {
    it('writes signed little-endian 32-bit', () => {
      const writer = new ByteWriter();
      writer.writeI32le(0x12345678);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
    });

    it('writes negative 32-bit', () => {
      const writer = new ByteWriter();
      writer.writeI32le(-2);
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0xFE, 0xFF, 0xFF, 0xFF]));
    });

    it('round-trips with DataView', () => {
      const writer = new ByteWriter();
      writer.writeI32le(-0x12345678);
      const result = writer.toUint8Array();
      const view = new DataView(result.buffer);
      expect(view.getInt32(0, true)).toBe(-0x12345678);
    });
  });

  describe('writeF64le', () => {
    it('writes little-endian 64-bit float', () => {
      const writer = new ByteWriter();
      writer.writeF64le(3.14159);
      const result = writer.toUint8Array();
      const view = new DataView(result.buffer);
      expect(view.getFloat64(0, true)).toBeCloseTo(3.14159, 5);
    });

    it('round-trips with DataView', () => {
      const writer = new ByteWriter();
      writer.writeF64le(2.718281828459045);
      const result = writer.toUint8Array();
      const view = new DataView(result.buffer);
      expect(view.getFloat64(0, true)).toBeCloseTo(2.718281828459045, 14);
    });
  });

  describe('writeBytes', () => {
    it('writes a Uint8Array', () => {
      const writer = new ByteWriter();
      writer.writeBytes(new Uint8Array([0x01, 0x02, 0x03]));
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
    });

    it('appends to existing data', () => {
      const writer = new ByteWriter();
      writer.writeU8(0xFF);
      writer.writeBytes(new Uint8Array([0x01, 0x02]));
      expect(writer.toUint8Array()).toEqual(new Uint8Array([0xFF, 0x01, 0x02]));
    });
  });

  describe('length', () => {
    it('tracks written bytes', () => {
      const writer = new ByteWriter();
      expect(writer.length).toBe(0);
      writer.writeU8(0x01);
      expect(writer.length).toBe(1);
      writer.writeU16le(0x1234);
      expect(writer.length).toBe(3);
    });
  });

  describe('capacity growth', () => {
    it('grows buffer automatically', () => {
      const writer = new ByteWriter();
      // Write more than initial 64 bytes
      for (let i = 0; i < 200; i++) {
        writer.writeU8(i & 0xff);
      }
      expect(writer.length).toBe(200);
      const arr = writer.toUint8Array();
      for (let i = 0; i < 200; i++) {
        expect(arr[i]).toBe(i & 0xff);
      }
    });
  });

  describe('round-trip with DataView', () => {
    it('all integer types', () => {
      const writer = new ByteWriter();
      writer.writeU8(0x42);
      writer.writeU16le(0x1234);
      writer.writeU16be(0x5678);
      writer.writeU32le(0x12345678);
      writer.writeU32be(0x9ABCDEF0);
      writer.writeI16le(-100);
      writer.writeI32le(-123456);
      writer.writeBytes(new Uint8Array([0xAA, 0xBB]));

      const result = writer.toUint8Array();
      const view = new DataView(result.buffer);

      expect(view.getUint8(0)).toBe(0x42);
      expect(view.getUint16(1, true)).toBe(0x1234);
      expect(view.getUint16(3, false)).toBe(0x5678);
      expect(view.getUint32(5, true)).toBe(0x12345678);
      expect(view.getUint32(9, false)).toBe(0x9ABCDEF0);
      expect(view.getInt16(13, true)).toBe(-100);
      expect(view.getInt32(15, true)).toBe(-123456);
      expect(result[19]).toBe(0xAA);
      expect(result[20]).toBe(0xBB);
    });
  });
});
