import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation } from '../../core/types.js';
import { hex } from '../bytes.js';
import { buildSpanIndex, topSpanAt } from './model.js';

export interface HexPaneProps {
  bytes: Uint8Array;
  annotations: readonly Annotation[];
  selected: { start: number; end: number } | null;
  /** Scroll so this offset is visible (changes trigger a scroll). */
  reveal: number | null;
  onPick: (offset: number) => void;
}

const ROW = 22; // px, matches .hex-row in autopsy.css
const HUES = 8;

/** Virtualised hex dump. Each byte is coloured by the top-level structure it belongs to. */
export function HexPane({ bytes, annotations, selected, reveal, onPick }: HexPaneProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(520);
  const index = useMemo(() => buildSpanIndex(annotations), [annotations]);
  const rows = Math.ceil(bytes.length / 16);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el || reveal === null) return;
    const y = Math.floor(reveal / 16) * ROW;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - ROW * 2) el.scrollTop = Math.max(0, y - ROW * 3);
  }, [reveal]);

  const first = Math.max(0, Math.floor(top / ROW) - 4);
  const last = Math.min(rows, Math.ceil((top + height) / ROW) + 4);
  const out = [];
  for (let r = first; r < last; r++) {
    const base = r * 16;
    const cells = [];
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      const at = base + i;
      if (at >= bytes.length) {
        cells.push(<span key={i} className="byte byte-none" />);
        continue;
      }
      const b = bytes[at]!;
      const span = topSpanAt(index, at);
      const on = selected !== null && at >= selected.start && at < selected.end;
      ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.';
      cells.push(
        <button
          key={i}
          type="button"
          tabIndex={on && at === selected?.start ? 0 : -1}
          className={`byte${span >= 0 ? ` hue-${span % HUES}` : ' byte-loose'}${on ? ' byte-on' : ''}${i === 8 ? ' byte-gap' : ''}`}
          onClick={() => onPick(at)}
          aria-label={`byte ${hex(b, 2)} at offset ${hex(at, 6)}`}
        >
          {hex(b, 2)}
        </button>,
      );
    }
    out.push(
      <div key={r} className="hex-row" style={{ top: r * ROW }}>
        <span className="hex-offset">{hex(base, 6)}</span>
        <span className="hex-bytes">{cells}</span>
        <span className="hex-ascii" aria-hidden="true">{ascii}</span>
      </div>,
    );
  }

  return (
    <div
      className="hex-pane"
      ref={scroller}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      role="region"
      aria-label={`Hex view, ${bytes.length} bytes`}
      tabIndex={0}
    >
      <div className="hex-canvas" style={{ height: rows * ROW }}>{out}</div>
    </div>
  );
}
