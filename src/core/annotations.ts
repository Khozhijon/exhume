// Helpers over annotation trees, shared by the Autopsy view, the MCP server and the property tests.
import type { Annotation } from './types.js';

export interface CoverageReport {
  /** True when the top-level spans tile [0, size) exactly: no gaps, no overlaps, nothing outside. */
  exact: boolean;
  gaps: Array<{ start: number; end: number }>;
  overlaps: Array<{ start: number; end: number }>;
  outOfBounds: Annotation[];
}

/** Check how the top-level annotations cover a file of `size` bytes. */
export function coverage(annotations: readonly Annotation[], size: number): CoverageReport {
  const sorted = [...annotations].sort((a, b) => a.start - b.start || a.end - b.end);
  const gaps: CoverageReport['gaps'] = [];
  const overlaps: CoverageReport['overlaps'] = [];
  const outOfBounds = sorted.filter((a) => a.start < 0 || a.end > size || a.end < a.start);
  let cursor = 0;
  for (const a of sorted) {
    if (a.end === a.start) continue; // zero-length notes do not cover anything
    if (a.start > cursor) gaps.push({ start: cursor, end: a.start });
    else if (a.start < cursor) overlaps.push({ start: a.start, end: Math.min(cursor, a.end) });
    cursor = Math.max(cursor, a.end);
  }
  if (cursor < size) gaps.push({ start: cursor, end: size });
  return { exact: gaps.length === 0 && overlaps.length === 0 && outOfBounds.length === 0, gaps, overlaps, outOfBounds };
}

/** True when every annotation in the tree lies inside the file and inside its parent. */
export function allInBounds(annotations: readonly Annotation[], size: number, lo = 0, hi = size): boolean {
  for (const a of annotations) {
    if (!(a.start >= lo && a.end <= hi && a.start <= a.end)) return false;
    if (a.children && !allInBounds(a.children, size, a.start, a.end)) return false;
  }
  return true;
}

/** Find the deepest annotation that contains byte `offset`, with its ancestors (outermost first). */
export function locate(annotations: readonly Annotation[], offset: number): Annotation[] {
  for (const a of annotations) {
    if (offset >= a.start && offset < a.end) {
      return [a, ...(a.children ? locate(a.children, offset) : [])];
    }
  }
  return [];
}

/** Count all nodes in the tree. */
export function countNodes(annotations: readonly Annotation[]): number {
  let n = 0;
  for (const a of annotations) n += 1 + (a.children ? countNodes(a.children) : 0);
  return n;
}
