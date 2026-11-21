import { useEffect, useRef } from 'react';
import type { Annotation } from '../../core/types.js';
import { hex } from '../bytes.js';
import { pathKey } from './model.js';

export interface AnnotationTreeProps {
  annotations: readonly Annotation[];
  selected: readonly number[] | null;
  expanded: ReadonlySet<string>;
  /** How many children of a node are shown (default PAGE); grows when the user asks for more. */
  shown: ReadonlyMap<string, number>;
  onSelect: (path: number[]) => void;
  onToggle: (key: string) => void;
  onMore: (key: string) => void;
}

export const PAGE = 120;
const HUES = 8;
const HUE_NAMES = ['Indigo', 'Plum', 'Jade', 'Ochre', 'Teal', 'Rose', 'Olive', 'Lavender'];

/** The structure the decoder found, as a collapsible tree. Long lists are paged. */
export function AnnotationTree(props: AnnotationTreeProps) {
  const root = useRef<HTMLDivElement>(null);
  const selectedKey = props.selected ? pathKey(props.selected) : '';

  useEffect(() => {
    if (!selectedKey) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-path="${selectedKey}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  return (
    <div className="tree-pane" ref={root} role="tree" aria-label="Structures found by the decoder">
      <Branch {...props} nodes={props.annotations} prefix={[]} selectedKey={selectedKey} />
    </div>
  );
}

interface BranchProps extends AnnotationTreeProps {
  nodes: readonly Annotation[];
  prefix: number[];
  selectedKey: string;
}

function Branch(props: BranchProps) {
  const { nodes, prefix, selectedKey, expanded, shown } = props;
  const parentKey = pathKey(prefix);
  const limit = Math.min(nodes.length, shown.get(parentKey) ?? PAGE);
  const items = [];
  for (let i = 0; i < limit; i++) {
    const node = nodes[i]!;
    const path = [...prefix, i];
    const key = pathKey(path);
    const kids = node.children ?? [];
    const open = expanded.has(key);
    const hue = prefix.length === 0 ? i % HUES : (prefix[0] ?? 0) % HUES;
    const hueName = HUE_NAMES[hue];
    items.push(
      <div key={key} role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={key === selectedKey}>
        <div className={`tree-row${key === selectedKey ? ' tree-on' : ''}`} style={{ paddingLeft: 6 + prefix.length * 14 }}>
          {kids.length ? (
            <button type="button" className="tree-twist" onClick={() => props.onToggle(key)} aria-label={open ? 'Collapse' : 'Expand'}>
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="tree-twist" aria-hidden="true" />
          )}
          <button type="button" className="tree-node" data-path={key} onClick={() => props.onSelect(path)}>
            <span className={`tree-swatch hue-${hue}`} aria-label={hueName} />
            <span className="tree-label">{node.label}</span>
            {node.value !== undefined && <span className="tree-value">= {node.value}</span>}
            <span className="tree-span">
              {hex(node.start, 6)}&ndash;{hex(Math.max(node.start, node.end - 1), 6)} &middot; {node.end - node.start} B
            </span>
          </button>
        </div>
        {open && kids.length > 0 && <Branch {...props} nodes={kids} prefix={path} />}
      </div>,
    );
  }
  return (
    <div role="group">
      {items}
      {limit < nodes.length && (
        <button type="button" className="btn btn-quiet tree-more" style={{ marginLeft: 6 + prefix.length * 14 }} onClick={() => props.onMore(parentKey)}>
          Show {Math.min(PAGE, nodes.length - limit)} more of {nodes.length - limit} hidden
        </button>
      )}
    </div>
  );
}
