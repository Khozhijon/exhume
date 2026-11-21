import { describe, expect, it } from 'vitest';
import { allInBounds, countNodes, coverage, locate } from './annotations.js';
import type { Annotation } from './types.js';

const tree: Annotation[] = [
  { label: 'header', start: 0, end: 4, children: [{ label: 'magic', start: 0, end: 2 }, { label: 'size', start: 2, end: 4 }] },
  { label: 'body', start: 4, end: 10 },
];

describe('coverage', () => {
  it('reports an exact tiling', () => {
    expect(coverage(tree, 10)).toEqual({ exact: true, gaps: [], overlaps: [], outOfBounds: [] });
  });
  it('finds a gap in the middle and at the end', () => {
    const r = coverage([{ label: 'a', start: 0, end: 2 }, { label: 'b', start: 5, end: 7 }], 9);
    expect(r.exact).toBe(false);
    expect(r.gaps).toEqual([{ start: 2, end: 5 }, { start: 7, end: 9 }]);
  });
  it('finds an overlap', () => {
    const r = coverage([{ label: 'a', start: 0, end: 6 }, { label: 'b', start: 4, end: 10 }], 10);
    expect(r.overlaps).toEqual([{ start: 4, end: 6 }]);
    expect(r.exact).toBe(false);
  });
  it('flags spans outside the file and ignores zero-length notes', () => {
    expect(coverage([{ label: 'a', start: 0, end: 12 }], 10).outOfBounds).toHaveLength(1);
    expect(coverage([{ label: 'note', start: 3, end: 3 }, { label: 'a', start: 0, end: 10 }], 10).exact).toBe(true);
  });
  it('treats an empty file with no annotations as exactly covered', () => {
    expect(coverage([], 0).exact).toBe(true);
  });
});

describe('allInBounds, locate, countNodes', () => {
  it('accepts children inside their parent and rejects strays', () => {
    expect(allInBounds(tree, 10)).toBe(true);
    expect(allInBounds([{ label: 'p', start: 0, end: 4, children: [{ label: 'c', start: 3, end: 6 }] }], 10)).toBe(false);
    expect(allInBounds([{ label: 'p', start: 8, end: 12 }], 10)).toBe(false);
  });
  it('locates the deepest annotation with its ancestors', () => {
    expect(locate(tree, 3).map((a) => a.label)).toEqual(['header', 'size']);
    expect(locate(tree, 7).map((a) => a.label)).toEqual(['body']);
    expect(locate(tree, 99)).toEqual([]);
  });
  it('counts every node', () => {
    expect(countNodes(tree)).toBe(4);
  });
});
