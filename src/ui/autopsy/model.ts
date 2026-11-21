// Pure helpers for the Autopsy view (no DOM): paths into the annotation tree and span lookup.
import type { Annotation } from '../../core/types.js';

/** Index path from the roots to the deepest annotation containing `offset` ([] when none does). */
export function pathAt(annotations: readonly Annotation[], offset: number): number[] {
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i]!;
    if (offset >= a.start && offset < a.end) {
      return [i, ...(a.children ? pathAt(a.children, offset) : [])];
    }
  }
  return [];
}

export function nodeAt(annotations: readonly Annotation[], path: readonly number[]): Annotation | null {
  let list: readonly Annotation[] | undefined = annotations;
  let node: Annotation | null = null;
  for (const i of path) {
    node = list?.[i] ?? null;
    if (!node) return null;
    list = node.children;
  }
  return node;
}

export const pathKey = (path: readonly number[]): string => path.join('/');

/** For each top-level span, sorted by start: lets the hex pane colour a byte in O(log n). */
export interface SpanIndex {
  starts: number[];
  ends: number[];
  order: number[];
}

export function buildSpanIndex(annotations: readonly Annotation[]): SpanIndex {
  const order = annotations.map((_, i) => i).sort((a, b) => annotations[a]!.start - annotations[b]!.start);
  return {
    order,
    starts: order.map((i) => annotations[i]!.start),
    ends: order.map((i) => annotations[i]!.end),
  };
}

/** Index (in original order) of the top-level span containing `offset`, or -1. */
export function topSpanAt(index: SpanIndex, offset: number): number {
  let lo = 0;
  let hi = index.starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offset < index.starts[mid]!) hi = mid - 1;
    else if (offset >= index.ends[mid]!) lo = mid + 1;
    else return index.order[mid]!;
  }
  return -1;
}
