import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Annotation } from '../../core/types.js';
import { countNodes, coverage } from '../../core/annotations.js';
import { hex } from '../bytes.js';
import { AnnotationTree, PAGE } from './AnnotationTree.js';
import { HexPane } from './HexPane.js';
import { nodeAt, pathAt, pathKey } from './model.js';
import '../autopsy.css';

export interface AutopsyProps {
  bytes: Uint8Array;
  annotations: readonly Annotation[];
  /** Offset to reveal when the view opens (from the coroner's report). */
  focusOffset: number | null;
}

/** The annotated hex view: bytes on the left, the structure the decoder found on the right. */
export function Autopsy({ bytes, annotations, focusOffset }: AutopsyProps) {
  const [selected, setSelected] = useState<number[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [shown, setShown] = useState<Map<string, number>>(() => new Map());
  const [reveal, setReveal] = useState<number | null>(null);

  const stats = useMemo(() => {
    const report = coverage(annotations, bytes.length);
    const loose = report.gaps.reduce((n, g) => n + (g.end - g.start), 0);
    return { nodes: countNodes(annotations), loose };
  }, [annotations, bytes.length]);

  /** Select a path and make sure it is visible in the tree (ancestors open, paging wide enough). */
  const openTo = useCallback((path: number[]) => {
    setSelected(path);
    setExpanded((old) => {
      const next = new Set(old);
      for (let d = 1; d < path.length; d++) next.add(pathKey(path.slice(0, d)));
      return next;
    });
    setShown((old) => {
      let next = old;
      for (let d = 0; d < path.length; d++) {
        const key = pathKey(path.slice(0, d));
        const need = (path[d] ?? 0) + 1;
        if ((old.get(key) ?? PAGE) < need) {
          if (next === old) next = new Map(old);
          next.set(key, Math.ceil(need / PAGE) * PAGE);
        }
      }
      return next;
    });
  }, []);

  const pickByte = useCallback(
    (offset: number) => {
      const path = pathAt(annotations, offset);
      if (path.length) openTo(path);
      else setSelected(null);
    },
    [annotations, openTo],
  );

  const pickNode = useCallback(
    (path: number[]) => {
      openTo(path);
      const node = nodeAt(annotations, path);
      if (node) setReveal(node.start);
    },
    [annotations, openTo],
  );

  useEffect(() => {
    if (focusOffset === null) return;
    pickByte(focusOffset);
    setReveal(focusOffset);
  }, [focusOffset, pickByte]);

  const node = selected ? nodeAt(annotations, selected) : null;
  const trail = selected
    ? selected.map((_, d) => nodeAt(annotations, selected.slice(0, d + 1))?.label ?? '?').join(' › ')
    : '';

  return (
    <section className="autopsy" aria-label="Autopsy">
      <p className="autopsy-summary">
        {bytes.length.toLocaleString('en-US')} bytes, {stats.nodes.toLocaleString('en-US')} labelled structures.{' '}
        {stats.loose === 0 ? 'Every byte is accounted for.' : `${stats.loose.toLocaleString('en-US')} bytes are not explained by the decoder (shown grey).`}{' '}
        Select a byte to see what it means, or a structure to see its bytes.
      </p>
      <div className="autopsy-finding" role="status" aria-live="polite">
        {node ? (
          <>
            <strong>{trail}</strong>
            {node.value !== undefined && <span className="mono"> = {node.value}</span>}
            <span className="mono autopsy-range">
              {' '}0x{hex(node.start, 6)} to 0x{hex(Math.max(node.start, node.end - 1), 6)}, {node.end - node.start} bytes
            </span>
          </>
        ) : (
          <span>Nothing selected.</span>
        )}
      </div>
      <div className="autopsy-panes">
        <HexPane
          bytes={bytes}
          annotations={annotations}
          selected={node ? { start: node.start, end: node.end } : null}
          reveal={reveal}
          onPick={pickByte}
        />
        <AnnotationTree
          annotations={annotations}
          selected={selected}
          expanded={expanded}
          shown={shown}
          onSelect={pickNode}
          onToggle={(key) =>
            setExpanded((old) => {
              const next = new Set(old);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          onMore={(key) => setShown((old) => new Map(old).set(key, (old.get(key) ?? PAGE) + PAGE))}
        />
      </div>
    </section>
  );
}
