// dBASE decoder. Layout: docs/formats/dbf.md. Damage becomes warnings; only an unusable file throws.
import { cp437, cp850, cp1252, decodeBytes } from '../../core/codepage.js';
import type { CodePage } from '../../core/codepage.js';
import { MAX_FILE_SIZE, MAX_RECORD_COUNT, assertLimit } from '../../core/limits.js';
import { ByteReader } from '../../core/reader.js';
import { ExhumeError } from '../../core/types.js';
import type { Specimen, TableField, TableRecord, Warning } from '../../core/types.js';
import { isValidDate, pad } from './model.js';

const VERSIONS = new Set([0x03, 0x83, 0x04, 0x8b, 0x30, 0x31, 0xf5]);
const FOXPRO = new Set([0x30, 0x31, 0xf5]);
const TYPES = 'CNFLDM';
const DETAIL_RECORDS = 5000; // records beyond this get one span each, without per-field leaves
const CHUNK = 1000; // more than 2000 records are grouped in chunks so no group has thousands of children
const MAX_WARNINGS = 100;
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

class Warnings {
  readonly list: Warning[] = [];
  private suppressed = false;
  add(message: string, offset?: number): void {
    if (this.list.length < MAX_WARNINGS) this.list.push(offset === undefined ? { message } : { message, offset });
    else if (!this.suppressed) {
      this.suppressed = true;
      this.list.push({ message: 'further warnings suppressed' });
    }
  }
}

function hex(n: number): string {
  return '0x' + n.toString(16).toUpperCase().padStart(2, '0');
}

export function decode(bytes: Uint8Array): Specimen {
  assertLimit(bytes.length, MAX_FILE_SIZE, 'file size');
  if (bytes.length < 32) throw new ExhumeError('too short for a dBASE header (32 bytes)', 'dbf');
  const version = bytes[0]!;
  if (!VERSIONS.has(version)) throw new ExhumeError(`not a dBASE file: unknown version byte ${hex(version)}`, 'dbf');

  const r = new ByteReader(bytes);
  const warn = new Warnings();
  if (FOXPRO.has(version)) warn.add(`FoxPro version byte ${hex(version)}: decoded as dBASE, some features may be missing`, 0);

  let lastUpdate = '';
  let promised = 0;
  let headerLength = 0;
  let headerRecordLength = 0;
  let driver = 0;
  r.group('header', () => {
    r.u8('version');
    const yy = r.u8('lastUpdate year-1900');
    const mm = r.u8('lastUpdate month');
    const dd = r.u8('lastUpdate day');
    lastUpdate = `${pad(1900 + yy, 4)}-${pad(mm, 2)}-${pad(dd, 2)}`;
    if (!isValidDate(1900 + yy, mm, dd)) warn.add(`last-update date ${lastUpdate} is not a real date`, 1);
    promised = r.u32le('recordCount');
    headerLength = r.u16le('headerLength');
    headerRecordLength = r.u16le('recordLength');
    r.skip(17, 'reserved');
    driver = r.u8('languageDriver');
    r.skip(2, 'reserved');
  });
  const cp: CodePage = driver === 2 ? cp850 : driver === 3 ? cp1252 : cp437;
  const driverKnown = driver === 1 || driver === 2 || driver === 3;

  const fields: TableField[] = [];
  r.group('fieldDescriptors', () => {
    while (r.remaining >= 32 && r.peek() !== 0x0d && fields.length < 255) {
      r.group(`field[${fields.length}]`, () => {
        const at = r.offset;
        const nameBytes = r.buffer_.subarray(at, at + 11);
        let nul = nameBytes.indexOf(0);
        if (nul < 0) nul = 11;
        const name = decodeBytes(nameBytes.subarray(0, nul), cp);
        r.mark('name', at, at + 11, JSON.stringify(name));
        const typeChar = String.fromCharCode(r.buffer_[r.offset]!);
        let type = typeChar;
        if (!TYPES.includes(typeChar)) {
          warn.add(`field ${name}: unsupported type "${typeChar}" shown as text`, r.offset);
          type = 'C';
        }
        r.mark('type', r.offset, r.offset + 1, typeChar);
        r.skip(4, 'reserved');
        const length = r.u8('length');
        const decimals = r.u8('decimals');
        r.skip(14, 'reserved');
        fields.push({ name, type: type as TableField['type'], length, decimals });
      });
    }
  });
  const terminated = r.peek() === 0x0d;
  if (terminated) r.mark('terminator', r.offset, r.offset + 1, '0x0D');
  else warn.add('field descriptors are not closed by a 0x0D terminator: the header is cut short', r.offset);
  if (fields.length === 0) throw new ExhumeError('dBASE header holds no field descriptors', 'dbf');

  const computed = 1 + fields.reduce((s, f) => s + f.length, 0);
  if (headerRecordLength < computed) warn.add(`header record length ${headerRecordLength} is smaller than the fields need (${computed})`, 10);
  const stride = Math.max(headerRecordLength, computed);
  let recStart = r.offset;
  if (terminated) {
    if (headerLength < recStart) warn.add(`header length ${headerLength} ends inside the field descriptors`, 8);
    else if (headerLength > bytes.length) {
      warn.add(`header length ${headerLength} is beyond the end of the file`, 8);
      if (r.remaining > 0) r.mark('headerPadding', recStart, bytes.length);
      recStart = bytes.length;
    } else if (headerLength > recStart) {
      r.mark('headerPadding', recStart, headerLength);
      recStart = headerLength;
    }
  }

  const records: TableRecord[] = [];
  let tableWarnMemo = false;
  let sawHigh = false;
  let pos = recStart;
  if (terminated) {
    const size = bytes.length;
    const eof = size - 1 >= recStart && bytes[size - 1] === 0x1a && (size - 1 - recStart) % stride === 0;
    const avail = eof ? (size - 1 - recStart) / stride : Math.floor((size - recStart) / stride);
    if (promised !== avail) {
      warn.add(`header promises ${promised} records but ${avail} complete records are present`, 4);
    }
    assertLimit(avail, MAX_RECORD_COUNT, 'record count');

    const decodeField = (f: TableField, at: number, rec: number): string | number | boolean | null => {
      const raw = bytes.subarray(at, at + f.length);
      switch (f.type) {
        case 'C': {
          if (!driverKnown && !sawHigh && raw.some((b) => b >= 0x80)) {
            sawHigh = true;
            warn.add(`language driver ${hex(driver)} is not known: text assumed to be CP437`, at);
          }
          return decodeBytes(raw, cp).replace(/ +$/, '');
        }
        case 'N':
        case 'F': {
          const text = decodeBytes(raw, cp).trim();
          if (text === '') return null;
          const n = NUMBER_RE.test(text) ? Number(text) : NaN;
          if (!Number.isFinite(n)) {
            warn.add(`record ${rec}, field ${f.name}: "${text}" is not a number: kept as empty`, at);
            return null;
          }
          return n === 0 ? 0 : n;
        }
        case 'D': {
          const text = decodeBytes(raw, cp);
          if (text.trim() === '' || /^0+$/.test(text)) return null;
          const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
          if (m && Number(m[1]) >= 1 && isValidDate(Number(m[1]), Number(m[2]), Number(m[3]))) return `${m[1]}-${m[2]}-${m[3]}`;
          warn.add(`record ${rec}, field ${f.name}: "${text}" is not a date: kept as empty`, at);
          return null;
        }
        case 'L': {
          const c = String.fromCharCode(raw[0] ?? 0x20);
          if ('TtYy'.includes(c)) return true;
          if ('FfNn'.includes(c)) return false;
          if (c !== '?' && c !== ' ') warn.add(`record ${rec}, field ${f.name}: "${c}" is not a logical value: kept as empty`, at);
          return null;
        }
        default:
          if (!tableWarnMemo) {
            tableWarnMemo = true;
            warn.add('memo fields need the .dbt file: their values are empty', at);
          }
          return null;
      }
    };

    const decodeRecord = (n: number): void => {
      const start = pos;
      const flag = bytes[start]!;
      const deleted = flag === 0x2a;
      if (flag !== 0x20 && !deleted) warn.add(`record ${n}: unusual flag byte ${hex(flag)} treated as live`, start);
      const values: TableRecord['values'] = [];
      let at = start + 1;
      const detailed = n < DETAIL_RECORDS;
      if (detailed) {
        r.group(`record[${n}]`, () => {
          r.mark('flag', start, start + 1, deleted ? '* deleted' : flag === 0x20 ? 'live' : hex(flag));
          for (const f of fields) {
            const v = decodeField(f, at, n);
            values.push(v);
            r.mark(f.name, at, at + f.length, JSON.stringify(v));
            at += f.length;
          }
          if (at < start + stride) r.mark('padding', at, start + stride);
        });
      } else {
        for (const f of fields) {
          values.push(decodeField(f, at, n));
          at += f.length;
        }
        r.mark(`record[${n}]`, start, start + stride, deleted ? 'deleted' : undefined);
      }
      pos = start + stride;
      records.push({ deleted, values });
    };

    r.seek(recStart);
    const wrap = (fn: () => void): void => (avail > 0 ? r.group('records', fn) : fn());
    wrap(() => {
      if (avail <= 2 * CHUNK) {
        for (let n = 0; n < avail; n++) decodeRecord(n);
      } else {
        for (let a = 0; a < avail; a += CHUNK) {
          const b = Math.min(avail, a + CHUNK);
          r.group(`records ${a}..${b - 1}`, () => {
            for (let n = a; n < b; n++) decodeRecord(n);
          });
        }
      }
    });
    pos = recStart + avail * stride;
    r.seek(pos);
    if (pos < size && bytes[pos] === 0x1a) r.mark('eofMarker', pos, pos + 1, '0x1A');
    else warn.add('no 0x1A end marker after the last record: the file may be cut short', pos);
    if (r.offset < size) {
      warn.add(`${size - r.offset} unexplained bytes after the last record`, r.offset);
      r.mark('trailing bytes', r.offset, size);
    }
  } else if (r.offset < bytes.length) {
    r.mark('trailing bytes', r.offset, bytes.length);
  }

  return {
    payload: { kind: 'table', fields, records, lastUpdate },
    annotations: r.annotations(),
    warnings: warn.list,
    meta: { recordCount: records.length, fieldCount: fields.length, lastUpdate },
  };
}
