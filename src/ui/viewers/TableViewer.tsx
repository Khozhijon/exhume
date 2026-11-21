// PLACEHOLDER: spec task 17 (Table Viewer) replaces this file.
import type { TablePayload } from '../../core/types.js';

export interface TableViewerProps {
  payload: TablePayload;
  fileName: string;
}

export function TableViewer({ payload }: TableViewerProps) {
  return <p>{payload.records.length} records, {payload.fields.length} fields.</p>;
}
