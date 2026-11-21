// Minimal XLSX writer built on fflate's zipSync. Pure: payload in, bytes out.
import { zipSync, strToU8 } from 'fflate';
import type { SheetPayload, TablePayload } from '../core/types.js';

export interface XlsxOptions {
  /** Lotus formula text -> Excel formula text (without leading "="), or null if untranslatable. */
  translateFormula?: (lotus: string) => string | null;
}

/** Strip characters that XML 1.0 cannot carry (control chars, U+FFFE/FFFF, lone surrogates), then escape. */
export function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;');
}

/** 0-based column index -> letters (0 = A, 25 = Z, 26 = AA). */
export function columnName(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function cellRef(col: number, row: number): string {
  return `${columnName(col)}${row + 1}`;
}

type Val = string | number | boolean | null | undefined;

/** Number formats used by the sheet. Index 0 is General; custom formats get ids from 164 up. */
class Styles {
  private readonly codes: string[] = [];
  /** Style index (for the `s` attribute) of a number format code; 0 when there is none. */
  index(code: string | null): number {
    if (!code) return 0;
    let i = this.codes.indexOf(code);
    if (i < 0) i = this.codes.push(code) - 1;
    return i + 1;
  }
  xml(): string {
    const fmts = this.codes.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${escapeXml(c)}"/>`).join('');
    const xfs = this.codes.map((_, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('');
    return `${this.codes.length ? `<numFmts count="${this.codes.length}">${fmts}</numFmts>` : ''}<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.codes.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xfs}</cellXfs>`;
  }
}

/**
 * The Excel number format for a 1-2-3 cell format, so currency, percent and date cells look in Excel
 * the way they did in 1-2-3. Lotus date serials and Excel date serials count the same days (both
 * include the non-existent 29 February 1900), so date cells only need a date format.
 */
export function lotusNumberFormat(format: { type: number; decimals: number }): string | null {
  const d = Math.max(0, Math.min(15, format.decimals));
  const places = d > 0 ? `.${'0'.repeat(d)}` : '';
  switch (format.type) {
    case 0: return `0${places}`;
    case 1: return `0${places}E+00`;
    case 2: return `"$"#,##0${places};("$"#,##0${places})`;
    case 3: return `0${places}%`;
    case 4: return `#,##0${places};(#,##0${places})`;
    case 7:
      return (
        { 2: 'd-mmm-yy', 3: 'd-mmm', 4: 'mmm-yy', 7: 'h:mm:ss AM/PM', 8: 'h:mm AM/PM', 9: 'mm/dd/yy', 10: 'mm/dd', 11: 'hh:mm:ss', 12: 'hh:mm' }[d] ?? null
      );
    default:
      return null;
  }
}

function valueCell(ref: string, v: Val, formula?: string, style = 0): string {
  const f = formula === undefined ? '' : `<f>${escapeXml(formula)}</f>`;
  const st = style > 0 ? ` s="${style}"` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}>${f}<v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}" t="b">${f}<v>${v ? 1 : 0}</v></c>`;
  if (v === null || v === undefined) return f ? `<c r="${ref}">${f}</c>` : '';
  const text = String(v);
  if (f) return `<c r="${ref}" t="str">${f}<v>${escapeXml(text)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

interface Built {
  styles: Styles;
  rows: Map<number, Map<number, string>>;
  widths: Map<number, number>;
  maxCol: number;
  maxRow: number;
}

function addCell(b: Built, col: number, row: number, xml: string): void {
  if (xml === '' || col < 0 || row < 0) return;
  let r = b.rows.get(row);
  if (!r) b.rows.set(row, (r = new Map()));
  r.set(col, xml);
  if (col > b.maxCol) b.maxCol = col;
  if (row > b.maxRow) b.maxRow = row;
}

function buildSheet(payload: SheetPayload, opts: XlsxOptions, warnings: string[]): Built {
  const b: Built = { styles: new Styles(), rows: new Map(), widths: new Map(), maxCol: 0, maxRow: 0 };
  const warned = new Set<string>();
  for (const c of payload.cells) {
    const ref = cellRef(c.col, c.row);
    let formula: string | undefined;
    if (c.type === 'formula' && typeof c.formula === 'string' && c.formula !== '') {
      const t = opts.translateFormula ? opts.translateFormula(c.formula) : null;
      if (typeof t === 'string') formula = t.replace(/^=/, '');
      else if (!warned.has(c.formula)) {
        warned.add(c.formula);
        warnings.push(`Formula "${c.formula}" (first at ${ref}) has no Excel equivalent; the cached value was stored instead.`);
      }
    }
    const style = typeof c.value === 'number' ? b.styles.index(lotusNumberFormat(c.format)) : 0;
    addCell(b, c.col, c.row, valueCell(ref, c.value, formula, style));
  }
  for (const [k, w] of Object.entries(payload.columnWidths)) {
    const col = Number(k);
    if (Number.isInteger(col) && col >= 0 && Number.isFinite(w) && w > 0) b.widths.set(col, w);
  }
  return b;
}

function buildTable(payload: TablePayload): Built {
  const b: Built = { styles: new Styles(), rows: new Map(), widths: new Map(), maxCol: 0, maxRow: 0 };
  payload.fields.forEach((f, col) => {
    addCell(b, col, 0, valueCell(cellRef(col, 0), f.name));
    b.widths.set(col, Math.min(60, Math.max(f.name.length, f.length, 4) + 2));
  });
  let row = 1;
  for (const rec of payload.records) {
    if (rec.deleted) continue;
    payload.fields.forEach((f, col) => {
      const v = rec.values[col];
      const fixed = (f.type === 'N' || f.type === 'F') && f.decimals > 0 ? b.styles.index(`0.${'0'.repeat(Math.min(15, f.decimals))}`) : 0;
      addCell(b, col, row, valueCell(cellRef(col, row), v, undefined, typeof v === 'number' ? fixed : 0));
    });
    row++;
  }
  return b;
}

function sheetXml(b: Built): string {
  const rowNums = [...b.rows.keys()].sort((a, c) => a - c);
  let data = '';
  for (const r of rowNums) {
    const cols = b.rows.get(r) as Map<number, string>;
    const cells = [...cols.keys()].sort((a, c) => a - c).map((k) => cols.get(k)).join('');
    data += `<row r="${r + 1}">${cells}</row>`;
  }
  const dim = rowNums.length ? `<dimension ref="A1:${cellRef(b.maxCol, b.maxRow)}"/>` : '';
  const colKeys = [...b.widths.keys()].sort((a, c) => a - c);
  const cols = colKeys.length
    ? `<cols>${colKeys.map((k) => `<col min="${k + 1}" max="${k + 1}" width="${b.widths.get(k)}" customWidth="1"/>`).join('')}</cols>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${dim}${cols}<sheetData>${data}</sheetData></worksheet>`;
}

const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

export function toXlsx(
  payload: SheetPayload | TablePayload,
  opts: XlsxOptions = {},
): { bytes: Uint8Array; warnings: string[] } {
  const warnings: string[] = [];
  const built = payload.kind === 'sheet' ? buildSheet(payload, opts, warnings) : buildTable(payload);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `${X}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_REL}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${X}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(
      `${X}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${built.styles.xml()}</styleSheet>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(built)),
  };
  return { bytes: zipSync(files, { level: 6, mtime: new Date(2000, 0, 1) }), warnings };
}
