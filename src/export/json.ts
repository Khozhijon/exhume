// JSON export. Pure.
import type { ImagePayload, SheetPayload, Specimen, SpecimenPayload, TablePayload } from '../core/types.js';
import { columnName } from './xlsx.js';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    cur +=
      (B64[(n >> 18) & 63] as string) +
      (B64[(n >> 12) & 63] as string) +
      (b === undefined ? '=' : (B64[(n >> 6) & 63] as string)) +
      (c === undefined ? '=' : (B64[n & 63] as string));
    if (cur.length > 8192) {
      parts.push(cur);
      cur = '';
    }
  }
  parts.push(cur);
  return parts.join('');
}

function imageJson(img: ImagePayload): unknown {
  return {
    kind: 'image',
    width: img.width,
    height: img.height,
    bitsPerPixel: img.bitsPerPixel,
    ...(img.palette ? { palette: img.palette } : {}),
    pixelEncoding: img.bitsPerPixel === 24 ? 'base64 RGB triples, row-major' : 'base64 one palette index per byte, row-major',
    pixels: toBase64(img.pixels),
    ...(img.patterns ? { patterns: img.patterns.map(toBase64) } : {}),
  };
}

/** Array of rows, each keyed by column letter; rows run from 0 to the last used row (unused rows are {}). */
function sheetJson(sheet: SheetPayload): unknown {
  const rows: Array<Record<string, number | string>> = [];
  for (const c of sheet.cells) {
    if (c.value === null || c.row < 0 || c.col < 0) continue;
    while (rows.length <= c.row) rows.push({});
    (rows[c.row] as Record<string, number | string>)[columnName(c.col)] = c.value;
  }
  return rows;
}

function tableJson(table: TablePayload): unknown {
  return table.records.map((rec) => {
    const o: Record<string, string | number | boolean | null> = {};
    table.fields.forEach((f, i) => {
      o[f.name] = rec.values[i] ?? null;
    });
    if (rec.deleted) o['_deleted'] = true;
    return o;
  });
}

export function toJson(payload: SpecimenPayload): string {
  switch (payload.kind) {
    case 'image':
      return JSON.stringify(imageJson(payload), null, 2);
    case 'sheet':
      return JSON.stringify(sheetJson(payload), null, 2);
    case 'table':
      return JSON.stringify(tableJson(payload), null, 2);
    case 'document':
      return JSON.stringify(payload, null, 2);
  }
}

/** Annotations, warnings and meta of a decoded specimen (no payload). */
export function autopsyToJson(specimen: Specimen, fileName?: string): string {
  return JSON.stringify(
    {
      ...(fileName !== undefined ? { fileName } : {}),
      kind: specimen.payload.kind,
      meta: specimen.meta,
      warnings: specimen.warnings,
      annotations: specimen.annotations,
    },
    null,
    2,
  );
}
