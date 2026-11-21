import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildSpanIndex, nodeAt, pathAt, pathKey, topSpanAt } from './model.js';
import type { Annotation } from '../../core/types.js';

const tree: Annotation[] = [
  { label: 'header', start: 0, end: 4, children: [{ label: 'magic', start: 0, end: 2 }, { label: 'size', start: 2, end: 4 }] },
  { label: 'body', start: 4, end: 10, children: [{ label: 'row 0', start: 4, end: 7 }, { label: 'row 1', start: 7, end: 10 }] },
];

describe('autopsy model', () => {
  it('pathAt and nodeAt are inverse: the byte lies inside the node the path leads to', () => {
    expect(pathAt(tree, 8)).toEqual([1, 1]);
    expect(nodeAt(tree, [1, 1])?.label).toBe('row 1');
    expect(pathAt(tree, 50)).toEqual([]);
    expect(nodeAt(tree, [9])).toBeNull();
    expect(pathKey([1, 1])).toBe('1/1');
  });
  it('topSpanAt finds the top-level span whatever the order of the input', () => {
    const shuffled = [tree[1]!, tree[0]!];
    const index = buildSpanIndex(shuffled);
    expect(topSpanAt(index, 0)).toBe(1);
    expect(topSpanAt(index, 9)).toBe(0);
    expect(topSpanAt(index, 10)).toBe(-1);
  });
  it('property: for consecutive spans, topSpanAt agrees with a linear scan at every offset', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 40 }), { minLength: 1, maxLength: 60 }), (sizes) => {
        let at = 0;
        const spans: Annotation[] = sizes.map((n, i) => ({ label: `s${i}`, start: at, end: (at += n) }));
        const index = buildSpanIndex(spans);
        for (let o = 0; o < at; o++) {
          expect(topSpanAt(index, o)).toBe(spans.findIndex((s) => o >= s.start && o < s.end));
          expect(pathAt(spans, o)).toEqual([topSpanAt(index, o)]);
        }
        expect(topSpanAt(index, at)).toBe(-1);
      }),
      { numRuns: 60 },
    );
  });
});
