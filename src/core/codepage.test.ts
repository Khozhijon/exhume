// Code page example tests. Expected values are taken from the published code charts.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cp437, cp850, cp1252, macRoman, latin1, decodeBytes, encodeString, isEncodable } from './codepage.js';

describe('code pages', () => {
  it('ASCII passes through in every table', () => {
    for (const cp of [cp437, cp850, cp1252, macRoman, latin1]) {
      for (let b = 0; b < 0x80; b++) expect(cp(b)).toBe(String.fromCharCode(b));
    }
  });

  it('cp437: accented letters, box drawing, Greek', () => {
    expect(cp437(0x80)).toBe('Ç');
    expect(cp437(0x82)).toBe('é');
    expect(cp437(0xa0)).toBe('á');
    expect(cp437(0xc4)).toBe('─');
    expect(cp437(0xdb)).toBe('█');
    expect(cp437(0xe1)).toBe('ß');
    expect(cp437(0xf6)).toBe('÷');
    expect(cp437(0xff)).toBe(' ');
  });

  it('cp850 differs from cp437 where it should', () => {
    expect(cp850(0x9b)).toBe('ø');
    expect(cp850(0xb5)).toBe('Á');
    expect(cp850(0xd5)).toBe('ı');
    expect(cp850(0x82)).toBe('é');
  });

  it('cp1252: Windows punctuation and Latin-1 body', () => {
    expect(cp1252(0x80)).toBe('€');
    expect(cp1252(0x93)).toBe('“');
    expect(cp1252(0x99)).toBe('™');
    expect(cp1252(0xe9)).toBe('é');
    expect(cp1252(0x81)).toBe('�');
  });

  it('macRoman: classic Mac characters', () => {
    expect(macRoman(0x80)).toBe('Ä');
    expect(macRoman(0x8e)).toBe('é');
    expect(macRoman(0xa0)).toBe('†');
    expect(macRoman(0xa5)).toBe('•');
    expect(macRoman(0xd2)).toBe('“');
  });

  it('decodeBytes joins characters', () => {
    expect(decodeBytes(new Uint8Array([0x43, 0x61, 0x66, 0x82]), cp437)).toBe('Café');
  });

  it('encodeString is the inverse of decodeBytes for representable text', () => {
    expect(Array.from(encodeString('Café', cp437))).toEqual([0x43, 0x61, 0x66, 0x82]);
    expect(Array.from(encodeString('☃', cp437))).toEqual([0x3f]);
    expect(isEncodable('Café', cp437)).toBe(true);
    expect(isEncodable('☃', cp437)).toBe(false);
  });

  it('property: decode then encode returns the same bytes (cp437 and macRoman are bijections)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        for (const cp of [cp437, macRoman, latin1]) {
          expect(Array.from(encodeString(decodeBytes(bytes, cp), cp))).toEqual(Array.from(bytes));
        }
      }),
    );
  });
});
