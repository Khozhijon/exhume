// The WK1 format byte (bit 7 protected, bits 4-6 type, bits 0-3 decimals) and display of a cell value
// the way 1-2-3 would show it.
import type { SheetCell } from '../../core/types.js';

export interface CellFormat { type: number; decimals: number; protected: boolean }

export function decodeFormatByte(b: number): CellFormat {
  return { type: (b >> 4) & 7, decimals: b & 15, protected: (b & 0x80) !== 0 };
}

export function encodeFormatByte(f: CellFormat): number {
  return ((f.protected ? 0x80 : 0) | ((f.type & 7) << 4) | (f.decimals & 15)) & 0xff;
}

const TYPE_NAMES = ['fixed', 'scientific', 'currency', 'percent', 'comma', 'type 5', 'type 6', 'special'];
const SPECIAL_NAMES: Record<number, string> = {
  0: '+/- bar', 1: 'general', 2: 'D-MMM-YY', 3: 'D-MMM', 4: 'MMM-YY', 5: 'text', 6: 'hidden',
  7: 'HH:MM:SS AM/PM', 8: 'HH:MM AM/PM', 9: 'MM/DD/YY', 10: 'MM/DD', 11: 'HH:MM:SS', 12: 'HH:MM', 15: 'default',
};

/** Human description of a cell format, e.g. "fixed, 2 decimals" or "special: D-MMM-YY, protected". */
export function describeFormat(f: CellFormat): string {
  const prot = f.protected ? ', protected' : '';
  if (f.type === 7) return `special: ${SPECIAL_NAMES[f.decimals] ?? `code ${f.decimals}`}${prot}`;
  return `${TYPE_NAMES[f.type] ?? '?'}, ${f.decimals} decimals${prot}`;
}

export function describeFormatByte(b: number): string {
  return describeFormat(decodeFormatByte(b));
}

// ---- dates -----------------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;
const p2 = (n: number): string => String(n).padStart(2, '0');

/**
 * 1-2-3 date serial -> calendar date. Serial 1 = 1 Jan 1900 and serial 60 is the non-existent
 * 29 Feb 1900. Serial >= 61: 1899-12-30 + serial days; serial < 60: 1899-12-31 + serial days.
 * Null outside 0..73050 (31 Dec 2099, the end of 1-2-3's range).
 */
export function serialToDate(serial: number): { y: number; m: number; d: number } | null {
  const n = Math.floor(serial);
  if (!(n >= 0 && n <= 73050)) return null;
  if (n === 60) return { y: 1900, m: 2, d: 29 };
  const t = new Date(Date.UTC(1899, 11, n >= 61 ? 30 : 31) + n * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** ISO yyyy-mm-dd for a serial (serial 60 gives the phantom 1900-02-29), or null when out of range. */
export function serialToIso(serial: number): string | null {
  const t = serialToDate(serial);
  return t ? `${String(t.y).padStart(4, '0')}-${p2(t.m)}-${p2(t.d)}` : null;
}

function timeParts(v: number): { h: number; m: number; s: number } {
  const secs = Math.round((v - Math.floor(v)) * 86400) % 86400;
  return { h: Math.floor(secs / 3600), m: Math.floor((secs % 3600) / 60), s: secs % 60 };
}

function time12(v: number, withSeconds: boolean): string {
  const t = timeParts(v);
  const h = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${p2(h)}:${p2(t.m)}${withSeconds ? `:${p2(t.s)}` : ''} ${t.h < 12 ? 'AM' : 'PM'}`;
}

function time24(v: number, withSeconds: boolean): string {
  const t = timeParts(v);
  return `${p2(t.h)}:${p2(t.m)}${withSeconds ? `:${p2(t.s)}` : ''}`;
}

function date(v: number, kind: number): string {
  const t = serialToDate(v);
  if (!t) return '########';
  const mon = MONTHS[t.m - 1] ?? '???';
  const yy = p2(t.y % 100);
  if (kind === 2) return `${t.d}-${mon}-${yy}`;
  if (kind === 3) return `${t.d}-${mon}`;
  if (kind === 4) return `${mon}-${yy}`;
  if (kind === 9) return `${p2(t.m)}/${p2(t.d)}/${yy}`;
  return `${p2(t.m)}/${p2(t.d)}`;
}

// ---- numbers ---------------------------------------------------------------------------------

/** Fixed-point text, rounding half away from zero (toFixed alone rounds the binary value). */
function fixed(v: number, d: number): string {
  const a = Math.abs(v);
  let s: string;
  if (a >= 1e15 || a < 1e-6) s = a.toFixed(d);
  else s = (Math.round(Number(`${a}e${d}`)) / 10 ** d).toFixed(d);
  return v < 0 && /[1-9]/.test(s) ? `-${s}` : s;
}

function group(s: string): string {
  const [int = '', frac] = s.split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? g : `${g}.${frac}`;
}

function sci(v: number, d: number): string {
  const m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(v.toExponential(d));
  if (!m) return String(v);
  return `${m[1]}E${m[2]}${(m[3] ?? '').padStart(2, '0')}`;
}

function general(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e10 || a < 1e-4) return sci(v, 9).replace(/(\.\d*?)0+E/, '$1E').replace(/\.E/, 'E');
  return String(Number(v.toPrecision(10)));
}

/** Render a cell the way 1-2-3 shows it. Labels and string results are returned as stored. */
export function formatValue(cell: SheetCell): string {
  const v = cell.value;
  if (v === null || cell.type === 'blank') return '';
  if (typeof v === 'string') return v;
  const { type, decimals } = cell.format;
  if (!Number.isFinite(v)) return 'ERR';
  const neg = v < 0 && /[1-9]/.test(fixed(v, decimals));
  const wrap = (s: string): string => (neg ? `(${s})` : s);
  switch (type) {
    case 0: return fixed(v, decimals);
    case 1: return sci(v, decimals);
    case 2: return wrap(`$${group(fixed(Math.abs(v), decimals))}`);
    case 3: return `${fixed(v * 100, decimals)}%`;
    case 4: return wrap(group(fixed(Math.abs(v), decimals)));
    case 7: return special(cell, v, decimals);
    default: return general(v);
  }
}

function special(cell: SheetCell, v: number, sub: number): string {
  switch (sub) {
    case 0: {
      const n = Math.round(v);
      return n === 0 ? '.' : (n > 0 ? '+' : '-').repeat(Math.min(Math.abs(n), 72));
    }
    case 2: case 3: case 4: case 9: case 10: return date(v, sub);
    case 5: {
      const f = cell.formula;
      if (cell.type !== 'formula' || typeof f !== 'string') return general(v);
      return /^[A-Za-z$0-9.]/.test(f) ? `+${f}` : f;
    }
    case 6: return '';
    case 7: return time12(v, true);
    case 8: return time12(v, false);
    case 11: return time24(v, true);
    case 12: return time24(v, false);
    default: return general(v);
  }
}
