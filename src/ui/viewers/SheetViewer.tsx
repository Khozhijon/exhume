import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { SheetCell, SheetPayload } from '../../core/types.js';
import { columnName } from '../../export/index.js';
import { describeFormat, formatValue } from '../../formats/wk1/format-byte.js';
import { translateToExcel } from '../../formats/wk1/excel.js';

export interface SheetViewerProps {
  payload: SheetPayload;
  fileName: string;
}

const MAX_ROWS = 500;
const MAX_COLS = 64;
const DEFAULT_WIDTH = 9;

function display(cell: SheetCell): string {
  if (cell.type === 'blank' || cell.value === null) return '';
  if (typeof cell.value === 'string') return cell.align === 'repeat' ? cell.value.repeat(40) : cell.value;
  return formatValue(cell);
}

function cellClass(cell: SheetCell | undefined, selected: boolean): string {
  const c: string[] = [];
  if (selected) c.push('sel');
  if (cell) {
    if (typeof cell.value === 'number') c.push('num');
    else if (cell.align === 'right') c.push('right');
    else if (cell.align === 'center') c.push('center');
    if (cell.type === 'formula') c.push('formula');
  }
  return c.join(' ');
}

/** A Lotus 1-2-3 worksheet the way the screen showed it: control panel on top, grid below. */
export function SheetViewer({ payload, fileName }: SheetViewerProps) {
  const [sel, setSel] = useState({ row: 0, col: 0 });
  const { cells, rows, cols, clipped } = useMemo(() => {
    const map = new Map<number, SheetCell>();
    let maxRow = 0;
    let maxCol = 0;
    for (const c of payload.cells) {
      map.set(c.row * 256 + c.col, c);
      if (c.row > maxRow) maxRow = c.row;
      if (c.col > maxCol) maxCol = c.col;
    }
    return {
      cells: map,
      rows: Math.min(MAX_ROWS, Math.max(20, maxRow + 2)),
      cols: Math.min(MAX_COLS, Math.max(8, maxCol + 2)),
      clipped: maxRow + 1 > MAX_ROWS || maxCol + 1 > MAX_COLS,
    };
  }, [payload]);

  const current = cells.get(sel.row * 256 + sel.col);
  const address = `${columnName(sel.col)}${sel.row + 1}`;
  const width = payload.columnWidths[sel.col];
  let content = '';
  if (current) {
    if (current.type === 'formula') content = current.formula ?? '(formula could not be decompiled)';
    else if (current.type === 'label') content = `${{ left: "'", right: '"', center: '^', repeat: '\\' }[current.align ?? 'left']}${String(current.value ?? '')}`;
    else if (current.value !== null) content = String(current.value);
  }
  const excel = current?.type === 'formula' && current.formula ? translateToExcel(current.formula) : null;

  const onKey = (e: KeyboardEvent) => {
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    setSel((s) => ({
      row: Math.max(0, Math.min(rows - 1, s.row + (d[0] ?? 0))),
      col: Math.max(0, Math.min(cols - 1, s.col + (d[1] ?? 0))),
    }));
  };

  const colIndexes = Array.from({ length: cols }, (_, i) => i);
  return (
    <div className="viewer-sheet">
      <div className="crt">
        <div className="crt-panel" aria-live="polite">
          <span>
            {address}: {current ? `${describeFormat(current.format)} ` : ''}{width !== undefined ? `[W${width}] ` : ''}{content}
          </span>
          <span className="mode">READY</span>
        </div>
        <div className="crt-sub">
          {current?.type === 'formula'
            ? excel
              ? `value ${display(current)}   Excel: =${excel}`
              : `value ${display(current)}   (no exact Excel equivalent: exported as its value)`
            : `${fileName}   1-2-3 release ${payload.version}   ${payload.cells.length} cells`}
        </div>
        <div className="crt-scroll">
          <table
            role="grid"
            aria-label={`${fileName} worksheet. Use the arrow keys to move the cell pointer.`}
            aria-activedescendant={`cell-${sel.row}-${sel.col}`}
            tabIndex={0}
            onKeyDown={onKey}
          >
            <colgroup>
              <col style={{ width: '3.4em' }} />
              {colIndexes.map((c) => (
                <col key={c} style={{ width: `${(payload.columnWidths[c] ?? DEFAULT_WIDTH) + 1}ch` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="rowhead" scope="col"><span className="sr-only">Row</span></th>
                {colIndexes.map((c) => <th key={c} scope="col">{columnName(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  <th className="rowhead" scope="row">{r + 1}</th>
                  {colIndexes.map((c) => {
                    const cell = cells.get(r * 256 + c);
                    const on = sel.row === r && sel.col === c;
                    return (
                      <td
                        key={c}
                        id={`cell-${r}-${c}`}
                        role="gridcell"
                        aria-selected={on}
                        className={cellClass(cell, on)}
                        onClick={() => setSel({ row: r, col: c })}
                      >
                        {cell ? display(cell) : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {clipped && <p className="viewer-note">Showing the first {MAX_ROWS} rows and {MAX_COLS} columns. Exports contain everything.</p>}
      {payload.names.length > 0 && (
        <p className="viewer-note">
          Named ranges: {payload.names.map((n) => `${n.name} = ${columnName(n.range.startCol)}${n.range.startRow + 1}..${columnName(n.range.endCol)}${n.range.endRow + 1}`).join(', ')}
        </p>
      )}
    </div>
  );
}
