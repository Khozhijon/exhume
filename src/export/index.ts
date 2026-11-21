// Export layer entry: what a payload can become, plus re-exports. All functions are pure.
import type { SpecimenPayload } from '../core/types.js';

export interface ExportTarget {
  id: string;
  label: string;
  extension: string;
  mime: string;
}

const T = {
  png: { id: 'png', label: 'PNG image', extension: 'png', mime: 'image/png' },
  csv: { id: 'csv', label: 'CSV (comma separated)', extension: 'csv', mime: 'text/csv' },
  xlsx: {
    id: 'xlsx',
    label: 'Excel workbook',
    extension: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  json: { id: 'json', label: 'JSON', extension: 'json', mime: 'application/json' },
  md: { id: 'md', label: 'Markdown', extension: 'md', mime: 'text/markdown' },
  html: { id: 'html', label: 'HTML page', extension: 'html', mime: 'text/html' },
  txt: { id: 'txt', label: 'Plain text', extension: 'txt', mime: 'text/plain' },
} satisfies Record<string, ExportTarget>;

export function exportTargets(payload: SpecimenPayload): ExportTarget[] {
  switch (payload.kind) {
    case 'image':
      return [T.png, T.json];
    case 'sheet':
    case 'table':
      return [T.csv, T.xlsx, T.json];
    case 'document':
      return [T.md, T.html, T.txt, T.json];
  }
}

export { encodePng, crc32 } from './png.js';
export { toCsv, parseCsv, sheetToRows, tableToRows } from './csv.js';
export { toXlsx, escapeXml, columnName, cellRef, lotusNumberFormat } from './xlsx.js';
export type { XlsxOptions } from './xlsx.js';
export { toJson, autopsyToJson, toBase64 } from './json.js';
export { toMarkdown, toHtml, toPlainText } from './document.js';
