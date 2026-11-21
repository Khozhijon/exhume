// dBASE model rules shared by encode(), the tests and the property-test arbitrary.
//
// A "valid model" is a TablePayload for which decode(encode(m)).payload deep-equals m:
//  - 1..255 fields; record length 1 + sum(lengths) <= 65535
//  - field name: 1..10 characters from A-Z 0-9 _ (uppercase ASCII); duplicates are allowed
//  - C: length 1..255, decimals 0; N/F: length 1..20, decimals 0..15 and (decimals == 0 or decimals <= length-2);
//    L: length 1, decimals 0; D: length 8, decimals 0; M: length 10, decimals 0
//  - lastUpdate: a real calendar date, year 1900..2155 (stored as one byte YY = year - 1900)
//  - values (one per field, in order):
//      C  string, never null (a blank field is ""), no trailing spaces, at most `length` characters,
//         every character encodable in CP437 (the language driver written is 0x01)
//      N/F  null (blank) or a number whose toFixed(decimals) text fits `length` and parses back to the
//         identical number (so no NaN, no Infinity, no -0, no 0.1+0.2 style values)
//      L  true / false / null (written T / F / ?)
//      D  null or "YYYY-MM-DD", a real date with year 0001..9999
//      M  always null (written as ten spaces: the memo block number is unknown)
//  - at most MAX_RECORD_COUNT records; `deleted` is a boolean
import { cp437, isEncodable } from '../../core/codepage.js';
import { MAX_RECORD_COUNT } from '../../core/limits.js';
import type { TableField, TablePayload } from '../../core/types.js';

export const NAME_RE = /^[A-Z0-9_]{1,10}$/;

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

export function isValidDate(y: number, m: number, d: number): boolean {
  return Number.isInteger(y) && y >= 0 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Text of a number as stored in an N/F field, or null when it cannot be stored exactly. */
export function formatNumber(value: number, length: number, decimals: number): string | null {
  if (!Number.isFinite(value) || Object.is(value, -0)) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 100) return null;
  const text = value.toFixed(decimals);
  if (text.length > length) return null;
  return Number(text) === value ? text : null;
}

function validField(f: TableField): string | null {
  if (!NAME_RE.test(f.name)) return `field name "${f.name}" is not 1..10 of A-Z 0-9 _`;
  const { length: len, decimals: dec } = f;
  if (!Number.isInteger(len) || !Number.isInteger(dec)) return `field ${f.name}: length/decimals must be integers`;
  switch (f.type) {
    case 'C': return len >= 1 && len <= 255 && dec === 0 ? null : `field ${f.name}: C needs length 1..255, decimals 0`;
    case 'N':
    case 'F':
      return len >= 1 && len <= 20 && dec >= 0 && dec <= 15 && (dec === 0 || dec <= len - 2)
        ? null : `field ${f.name}: bad numeric length/decimals`;
    case 'L': return len === 1 && dec === 0 ? null : `field ${f.name}: L needs length 1, decimals 0`;
    case 'D': return len === 8 && dec === 0 ? null : `field ${f.name}: D needs length 8, decimals 0`;
    case 'M': return len === 10 && dec === 0 ? null : `field ${f.name}: M needs length 10, decimals 0`;
    default: return `field ${f.name}: unknown type`;
  }
}

function validValue(f: TableField, v: string | number | boolean | null): string | null {
  switch (f.type) {
    case 'C':
      if (typeof v !== 'string') return `${f.name}: C value must be a string`;
      if (v.length > f.length) return `${f.name}: value longer than ${f.length}`;
      if (v.endsWith(' ')) return `${f.name}: C value has trailing spaces`;
      return isEncodable(v, cp437) ? null : `${f.name}: value not encodable in CP437`;
    case 'N':
    case 'F':
      if (v === null) return null;
      return typeof v === 'number' && formatNumber(v, f.length, f.decimals) !== null
        ? null : `${f.name}: ${String(v)} is not representable in ${f.length}.${f.decimals}`;
    case 'L': return v === null || typeof v === 'boolean' ? null : `${f.name}: L value must be boolean or null`;
    case 'D': {
      if (v === null) return null;
      const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
      return m && Number(m[1]) >= 1 && isValidDate(Number(m[1]), Number(m[2]), Number(m[3]))
        ? null : `${f.name}: bad date`;
    }
    case 'M': return v === null ? null : `${f.name}: M values must be null`;
    default: return `${f.name}: unknown type`;
  }
}

/** null when `model` is a valid model (see the rules at the top of this file), else a reason. */
export function validateTable(model: TablePayload): string | null {
  const { fields, records } = model;
  if (fields.length < 1 || fields.length > 255) return 'a table needs 1..255 fields';
  for (const f of fields) {
    const bad = validField(f);
    if (bad) return bad;
  }
  if (1 + fields.reduce((s, f) => s + f.length, 0) > 65535) return 'record length exceeds 65535';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(model.lastUpdate);
  if (!m || Number(m[1]) < 1900 || Number(m[1]) > 2155 || !isValidDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
    return 'lastUpdate must be a real date in 1900..2155';
  }
  if (records.length > MAX_RECORD_COUNT) return 'too many records';
  for (const [i, rec] of records.entries()) {
    if (typeof rec.deleted !== 'boolean' || rec.values.length !== fields.length) return `record ${i}: bad shape`;
    for (const [j, f] of fields.entries()) {
      const bad = validValue(f, rec.values[j] ?? null);
      if (bad) return `record ${i}: ${bad}`;
    }
  }
  return null;
}
