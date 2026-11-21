import type { Annotation } from '../core/types.js';
import { formatSize } from './bytes.js';

export interface FileMapProps {
  annotations: readonly Annotation[];
  size: number;
  onJump: (offset: number) => void;
}

const HUES = 8;
const MAX_SEGMENTS = 600;
const LEGEND = 7;

/**
 * The whole file as one bar: each top-level structure is a segment as wide as its share of the bytes,
 * in the same colour the Autopsy uses. Selecting a segment opens the Autopsy there.
 */
export function FileMap({ annotations, size, onJump }: FileMapProps) {
  if (size === 0 || annotations.length === 0) return null;
  const segments = annotations.slice(0, MAX_SEGMENTS);
  const biggest = annotations
    .map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.end - y.a.start - (x.a.end - x.a.start))
    .slice(0, LEGEND)
    .sort((x, y) => x.i - y.i);

  return (
    <nav className="filemap" aria-label="File map: the structures in this file, in order">
      <div className="filemap-bar">
        {segments.map((a, i) => (
          <button
            key={i}
            type="button"
            className={`filemap-seg hue-${i % HUES}`}
            style={{ flexGrow: Math.max(1, a.end - a.start) }}
            title={`${a.label}: ${formatSize(a.end - a.start)} at offset ${a.start}`}
            aria-label={`${a.label}, ${a.end - a.start} bytes at offset ${a.start}. Open in autopsy.`}
            onClick={() => onJump(a.start)}
          />
        ))}
      </div>
      <ul className="filemap-legend">
        {biggest.map(({ a, i }) => (
          <li key={i}>
            <button type="button" className="filemap-key" onClick={() => onJump(a.start)}>
              <span className={`tree-swatch hue-${i % HUES}`} aria-hidden="true" />
              {a.label} <span className="filemap-size">{formatSize(a.end - a.start)}</span>
            </button>
          </li>
        ))}
        {annotations.length > biggest.length && (
          <li className="filemap-more">and {annotations.length - biggest.length} more structures</li>
        )}
      </ul>
    </nav>
  );
}
