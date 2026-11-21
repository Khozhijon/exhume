import { useMemo, useState, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { TableField, TablePayload, TableRecord } from '../../core/types.js';
import './table.css';

export interface TableViewerProps {
  payload: TablePayload;
  fileName: string;
}

const MAX_ROWS = 1000;

function formatValue(value: unknown, field: TableField): string {
  if (value === null) return '·';
  if (field.type === 'L') return value ? '.T.' : '.F.';
  if (field.type === 'D') return String(value);
  if (field.type === 'N' || field.type === 'F') {
    if (typeof value === 'number') {
      return value.toFixed(field.decimals);
    }
    return String(value);
  }
  if (field.type === 'C') {
    if (typeof value === 'string') return value;
    return String(value);
  }
  return String(value);
}

function fieldType(field: TableField): string {
  if (field.type === 'D') return 'D';
  if (field.type === 'L') return 'L';
  if (field.type === 'M') return 'M';
  if (field.type === 'N' || field.type === 'F') {
    return `${field.type} ${field.length}.${field.decimals}`;
  }
  if (field.type === 'C') return `C ${field.length}`;
  return field.type;
}

export function TableViewer({ payload, fileName }: TableViewerProps) {
  const [selected, setSelected] = useState(0);
  const [showDeleted, setShowDeleted] = useState(true);
  const tableRef = useRef<HTMLTableElement>(null);

  const visible = useMemo(
    () =>
      payload.records
        .map((rec, idx) => ({ record: rec, index: idx }))
        .filter((x) => showDeleted || !x.record.deleted)
        .slice(0, MAX_ROWS),
    [payload.records, showDeleted],
  );

  const isClipped = useMemo(
    () =>
      payload.records.filter((x) => showDeleted || !x.deleted).length > MAX_ROWS,
    [payload.records, showDeleted],
  );

  const deletedCount = useMemo(
    () => payload.records.filter((x) => x.deleted).length,
    [payload.records],
  );

  const selectedRec = visible[selected]?.record;
  const selectedIdx = visible[selected]?.index;

  const onKey = (e: KeyboardEvent) => {
    const d = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    setSelected((s) => Math.max(0, Math.min(visible.length - 1, s + d)));
  };

  const handleRowClick = (idx: number) => {
    setSelected(idx);
    tableRef.current?.focus();
  };

  return (
    <div className="viewer-table">
      <div className="crt">
        <div className="crt-panel" aria-live="polite">
          <span className="mode">. USE {fileName.toUpperCase()}</span>
          <span className="mode">. BROWSE</span>
        </div>
        <div className="table-scroll">
          <table
            ref={tableRef}
            className="table-content"
            tabIndex={0}
            onKeyDown={onKey}
            role="grid"
            aria-label={`Browse ${fileName}: ${visible.length} visible records`}
          >
            <thead>
              <tr>
                <th scope="col" className="rowhead">
                  Rec
                </th>
                {payload.fields.map((field, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={field.type === 'N' || field.type === 'F' ? 'col-num' : 'col-text'}
                  >
                    <div className="field-name">{field.name}</div>
                    <div className="field-type">{fieldType(field)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ record, index }, visIdx) => (
                <tr
                  key={index}
                  className={`${record.deleted ? 'row-deleted' : ''} ${visIdx === selected ? 'sel' : ''}`}
                  onClick={() => handleRowClick(visIdx)}
                  role="row"
                  aria-selected={visIdx === selected}
                >
                  <td className="rowhead">
                    {index + 1}
                    {record.deleted && '*'}
                  </td>
                  {payload.fields.map((field, i) => (
                    <td
                      key={i}
                      className={field.type === 'N' || field.type === 'F' ? 'col-num' : 'col-text'}
                    >
                      {formatValue(record.values[i], field)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="crt-status">
          <span>BROWSE</span>
          <span>|&lt;C:&gt;|</span>
          <span>{fileName.toUpperCase()}</span>
          <span>
            |Rec:{' '}
            {selectedIdx !== undefined
              ? `${selectedIdx + 1}/${payload.records.length}`
              : `${payload.records.length}`}
          </span>
          <span>|</span>
          {selectedRec?.deleted && <span>Del|</span>}
        </div>
      </div>
      <div className="table-controls">
        <button
          className="btn"
          aria-pressed={showDeleted}
          onClick={() => {
            setShowDeleted(!showDeleted);
            setSelected(0);
          }}
        >
          {showDeleted ? `Hide deleted records (${deletedCount})` : `Show deleted records (${deletedCount})`}
        </button>
      </div>
      {isClipped && (
        <p className="table-clipped">
          Showing {MAX_ROWS} of {payload.records.filter((x) => showDeleted || !x.deleted).length} records.
        </p>
      )}
    </div>
  );
}
