// CSV (RFC 4180) writer/parser and payload-to-grid helpers. Pure.
import type { SheetPayload, TablePayload } from '../core/types.js';

/** Display text of a sheet cell value. Isolated so a number formatter can be swapped in later.
 *  src/formats/wk1/format-byte.js did not exist when this was written: plain String(value) is used. */
function displayValue(value: number | string | null): string {
  return value === null ? '' : String(value);
}

function quoteField(f: string): string {
  return /[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f;
}

/**
 * RFC 4180: CRLF after every row (including the last), fields quoted when they contain a comma,
 * quote, CR or LF. Ambiguity: a row holding one empty field would serialise to a blank line, which
 * readers may drop, so it is written as `""` instead. Rows with zero fields cannot be represented
 * (they would also be blank lines) and are written as a blank line, which parses back as [""].
 */
export function toCsv(rows: string[][]): string {
  let out = '';
  for (const row of rows) {
    out += row.length === 1 && row[0] === '' ? '""' : row.map(quoteField).join(',');
    out += '\r\n';
  }
  return out;
}

/** Inverse of toCsv. Accepts CRLF, LF or CR row ends and a missing final terminator. A blank line parses as [""]. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let pending = false; // something has been read for the current row
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      pending = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      pending = true;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      pending = false;
    } else {
      field += ch;
      pending = true;
    }
  }
  if (pending || inQuotes) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Dense grid from row 0 / col 0 to the last used cell; blank cells become "". */
export function sheetToRows(sheet: SheetPayload): string[][] {
  const used = sheet.cells.filter((c) => c.type !== 'blank' || c.value !== null);
  if (used.length === 0) return [];
  let maxRow = 0;
  let maxCol = 0;
  for (const c of used) {
    if (c.row > maxRow) maxRow = c.row;
    if (c.col > maxCol) maxCol = c.col;
  }
  const rows: string[][] = Array.from({ length: maxRow + 1 }, () => new Array<string>(maxCol + 1).fill(''));
  for (const c of used) {
    const r = rows[c.row];
    if (r && c.col >= 0) r[c.col] = displayValue(c.value);
  }
  return rows;
}

function tableCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/** Header row of field names, then one row per record. */
export function tableToRows(table: TablePayload, opts: { includeDeleted?: boolean } = {}): string[][] {
  const inc = opts.includeDeleted === true;
  const rows: string[][] = [[...(inc ? ['DELETED'] : []), ...table.fields.map((f) => f.name)]];
  for (const rec of table.records) {
    if (rec.deleted && !inc) continue;
    const cells = table.fields.map((_, i) => tableCell(rec.values[i]));
    rows.push(inc ? [rec.deleted ? 'DELETED' : '', ...cells] : cells);
  }
  return rows;
}
