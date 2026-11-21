// dBASE III writer: version 0x03, language driver 0x01 (CP437). See model.ts for what a valid model is.
import { cp437, encodeString } from '../../core/codepage.js';
import { ByteWriter } from '../../core/writer.js';
import { ExhumeError } from '../../core/types.js';
import type { SpecimenPayload, TableField } from '../../core/types.js';
import { formatNumber, validateTable } from './model.js';

function fieldBytes(f: TableField, v: string | number | boolean | null): Uint8Array {
  const out = new Uint8Array(f.length).fill(0x20);
  let text = '';
  switch (f.type) {
    case 'C': out.set(encodeString(v as string, cp437)); return out;
    case 'N':
    case 'F': text = v === null ? '' : (formatNumber(v as number, f.length, f.decimals) ?? ''); break;
    case 'L': text = v === true ? 'T' : v === false ? 'F' : '?'; break;
    case 'D': text = v === null ? '' : (v as string).replace(/-/g, ''); break;
    case 'M': break;
  }
  // numbers are right-aligned; everything else starts at the left edge
  const at = f.type === 'N' || f.type === 'F' ? f.length - text.length : 0;
  for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i);
  return out;
}

export function encode(model: SpecimenPayload): Uint8Array {
  if (model.kind !== 'table') throw new ExhumeError('dbf: encode needs a table payload', 'dbf');
  const problem = validateTable(model);
  if (problem) throw new ExhumeError(`dbf: invalid model: ${problem}`, 'dbf');
  const { fields, records } = model;
  const recordLength = 1 + fields.reduce((s, f) => s + f.length, 0);
  const headerLength = 32 + 32 * fields.length + 1;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(model.lastUpdate)!;

  const w = new ByteWriter();
  w.writeU8(0x03);
  w.writeU8(Number(date[1]) - 1900);
  w.writeU8(Number(date[2]));
  w.writeU8(Number(date[3]));
  w.writeU32le(records.length);
  w.writeU16le(headerLength);
  w.writeU16le(recordLength);
  for (let i = 0; i < 17; i++) w.writeU8(0); // bytes 12..28 reserved
  w.writeU8(0x01); // byte 29: language driver, CP437
  w.writeU8(0);
  w.writeU8(0);
  for (const f of fields) {
    const name = new Uint8Array(11);
    for (let i = 0; i < f.name.length; i++) name[i] = f.name.charCodeAt(i);
    w.writeBytes(name);
    w.writeU8(f.type.charCodeAt(0));
    w.writeU32le(0);
    w.writeU8(f.length);
    w.writeU8(f.decimals);
    for (let i = 0; i < 14; i++) w.writeU8(0);
  }
  w.writeU8(0x0d);
  for (const rec of records) {
    w.writeU8(rec.deleted ? 0x2a : 0x20);
    for (const [j, f] of fields.entries()) w.writeBytes(fieldBytes(f, rec.values[j] ?? null));
  }
  w.writeU8(0x1a);
  return w.toUint8Array().slice();
}
