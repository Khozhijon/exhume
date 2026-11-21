import { describe, expect, it } from 'vitest';
import { hexdump, identifyBytes, renderAnnotations, safeRead, summarisePayload } from './lib.mjs';

describe('hexdump', () => {
  it('formats a full row: offset, two groups of eight, ASCII column', () => {
    const bytes = Uint8Array.from([0x0a, 0x05, 0x01, 0x08, 0, 0, 0, 0, 0x3f, 0x01, 0xc7, 0x00, 0x48, 0x00, 0x48, 0x00]);
    expect(hexdump(bytes)).toEqual(['00000000: 0A 05 01 08 00 00 00 00  3F 01 C7 00 48 00 48 00  |........?...H.H.|']);
  });
  it('pads a short last row so the ASCII column lines up', () => {
    const lines = hexdump(Uint8Array.from({ length: 19 }, (_, i) => 0x41 + i));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('00000010: 51 52 53                                          |QRS             |');
    expect(lines[1].length).toBe(lines[0].length);
  });
  it('windows by offset and length', () => {
    const bytes = Uint8Array.from({ length: 64 }, (_, i) => i);
    expect(hexdump(bytes, 0x20, 4)).toEqual(['00000020: 20 21 22 23                                       | !"#            |']);
    expect(hexdump(bytes, 60, 100)).toHaveLength(1);
  });
  it('returns no lines for empty input or an offset past the end', () => {
    expect(hexdump(new Uint8Array(0))).toEqual([]);
    expect(hexdump(new Uint8Array(4), 99)).toEqual([]);
  });
});

describe('safeRead', () => {
  it('reads a file inside the root', () => {
    expect(safeRead('package.json').length).toBeGreaterThan(10);
  });
  it('refuses to leave the root', () => {
    expect(() => safeRead('../../etc/hosts')).toThrow(/outside the project/);
    expect(() => safeRead('/etc/hosts')).toThrow(/outside the project/);
  });
  it('refuses directories', () => {
    expect(() => safeRead('mcp')).toThrow(/not a file/);
  });
});

describe('identifyBytes', () => {
  it('maps registry matches to id, name and rounded confidence', () => {
    const registry = { detect: () => [{ module: { id: 'pcx', name: 'PCX' }, confidence: 0.85000001 }] };
    expect(identifyBytes(new Uint8Array(1), 'a.pcx', registry)).toEqual([{ id: 'pcx', name: 'PCX', confidence: 0.85 }]);
  });
});

describe('renderAnnotations', () => {
  const tree = [
    { label: 'header', start: 0, end: 4, children: [{ label: 'magic', start: 0, end: 2, value: '0x0A05' }, { label: 'size', start: 2, end: 4, value: '7' }] },
    { label: 'body', start: 4, end: 20, children: Array.from({ length: 30 }, (_, i) => ({ label: `row ${i}`, start: 4, end: 5 })) },
  ];
  it('prints an indented tree with spans and values', () => {
    const lines = renderAnnotations(tree);
    expect(lines[0]).toBe('000000..000003 (4 B) header');
    expect(lines[1]).toBe('  000000..000001 (2 B) magic = 0x0A05');
  });
  it('caps children per level and says how many are hidden', () => {
    expect(renderAnnotations(tree).some((l) => l.includes('18 more at this level'))).toBe(true);
  });
  it('stops at maxDepth and reports the child count instead', () => {
    expect(renderAnnotations(tree, { maxDepth: 1 })).toEqual(['000000..000003 (4 B) header [2 children]', '000004..000013 (16 B) body [30 children]']);
  });
});

describe('summarisePayload', () => {
  it('never returns raw pixels for images', () => {
    const s = summarisePayload({ kind: 'image', width: 4, height: 2, bitsPerPixel: 8, palette: [[0, 0, 0]], pixels: new Uint8Array(8) });
    expect(s.pixels).toBeUndefined();
    expect(s.width).toBe(4);
  });
  it('caps table records', () => {
    const s = summarisePayload({ kind: 'table', lastUpdate: '1987-10-31', fields: [], records: Array.from({ length: 50 }, () => ({ deleted: false, values: [] })) }, { maxItems: 5 });
    expect(s.records).toHaveLength(5);
    expect(s.recordCount).toBe(50);
  });
});
