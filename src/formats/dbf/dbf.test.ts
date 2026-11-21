import { describe, expect, it } from 'vitest';
import { allInBounds, coverage } from '../../core/annotations.js';
import { ExhumeError } from '../../core/types.js';
import type { TablePayload } from '../../core/types.js';
import { dbf } from './index.js';
import { encode } from './encode.js';
import { decode } from './decode.js';

interface RawField { name: string; type: string; length: number; decimals?: number }

/** Hand-built dBASE file (independent of encode()) so the decoder is tested against the layout notes. */
function raw(opts: {
  version?: number; driver?: number; fields: RawField[]; records: string[]; count?: number; eof?: boolean;
  recordBytes?: number[][];
}): Uint8Array {
  const recLen = 1 + opts.fields.reduce((s, f) => s + f.length, 0);
  const hdrLen = 32 + 32 * opts.fields.length + 1;
  const out: number[] = new Array<number>(32).fill(0);
  out[0] = opts.version ?? 0x03;
  out[1] = 95; out[2] = 7; out[3] = 26;
  const count = opts.count ?? opts.records.length;
  out[4] = count & 255; out[5] = (count >> 8) & 255;
  out[8] = hdrLen & 255; out[9] = hdrLen >> 8;
  out[10] = recLen & 255; out[11] = recLen >> 8;
  out[29] = opts.driver ?? 1;
  for (const f of opts.fields) {
    const d = new Array<number>(32).fill(0);
    for (let i = 0; i < f.name.length; i++) d[i] = f.name.charCodeAt(i);
    d[11] = f.type.charCodeAt(0); d[16] = f.length; d[17] = f.decimals ?? 0;
    out.push(...d);
  }
  out.push(0x0d);
  for (const rec of opts.records) for (let i = 0; i < rec.length; i++) out.push(rec.charCodeAt(i));
  for (const rb of opts.recordBytes ?? []) out.push(...rb);
  if (opts.eof !== false) out.push(0x1a);
  return Uint8Array.from(out);
}

const ALL: RawField[] = [
  { name: 'NAME', type: 'C', length: 8 },
  { name: 'AGE', type: 'N', length: 5, decimals: 1 },
  { name: 'SCORE', type: 'F', length: 6, decimals: 2 },
  { name: 'ALIVE', type: 'L', length: 1 },
  { name: 'BORN', type: 'D', length: 8 },
  { name: 'NOTES', type: 'M', length: 10 },
];

describe('dbf decode', () => {
  it('decodes all six field types', () => {
    const bytes = raw({
      fields: ALL,
      records: [' Ada     ' + ' 36.5' + '  1.25' + 'T' + '18151210' + '         7', ' Bob     ' + '     ' + '      ' + '?' + '        ' + '          '],
    });
    const s = decode(bytes);
    expect(s.payload).toEqual({
      kind: 'table',
      lastUpdate: '1995-07-26',
      fields: [
        { name: 'NAME', type: 'C', length: 8, decimals: 0 },
        { name: 'AGE', type: 'N', length: 5, decimals: 1 },
        { name: 'SCORE', type: 'F', length: 6, decimals: 2 },
        { name: 'ALIVE', type: 'L', length: 1, decimals: 0 },
        { name: 'BORN', type: 'D', length: 8, decimals: 0 },
        { name: 'NOTES', type: 'M', length: 10, decimals: 0 },
      ],
      records: [
        { deleted: false, values: ['Ada', 36.5, 1.25, true, '1815-12-10', null] },
        { deleted: false, values: ['Bob', null, null, null, null, null] },
      ],
    });
    expect(s.warnings.filter((w) => w.message.includes('.dbt'))).toHaveLength(1);
    expect(s.meta).toMatchObject({ recordCount: 2, fieldCount: 6, lastUpdate: '1995-07-26' });
    expect(coverage(s.annotations, bytes.length).exact).toBe(true);
    expect(s.annotations.map((a) => a.label)).toEqual(['header', 'fieldDescriptors', 'terminator', 'records', 'eofMarker']);
  });

  it('logical values: T t Y y true, F f N n false, ? and space null', () => {
    const fields = [{ name: 'L', type: 'L', length: 1 }];
    const s = decode(raw({ fields, records: [' T', ' t', ' Y', ' y', ' F', ' f', ' N', ' n', ' ?', '  '] }));
    expect(s.payload.kind === 'table' && s.payload.records.map((r) => r.values[0])).toEqual([
      true, true, true, true, false, false, false, false, null, null,
    ]);
    expect(s.warnings).toEqual([]);
  });

  it('non-numeric text in N keeps null and warns; bad date and bad logical warn too', () => {
    const fields = [{ name: 'N', type: 'N', length: 4 }, { name: 'D', type: 'D', length: 8 }, { name: 'L', type: 'L', length: 1 }];
    const s = decode(raw({ fields, records: [' 1x2 ' + '20011340' + 'Q', ' -3  ' + '20240229' + 'T'] }));
    expect(s.payload.kind === 'table' && s.payload.records.map((r) => r.values)).toEqual([[null, null, null], [-3, '2024-02-29', true]]);
    expect(s.warnings.map((w) => w.message).join('\n')).toMatch(/not a number[\s\S]*not a date[\s\S]*not a logical/);
  });

  it('deleted records are kept with deleted:true', () => {
    const fields = [{ name: 'A', type: 'C', length: 3 }];
    const s = decode(raw({ fields, records: [' abc', '*def', ' ghi'] }));
    expect(s.payload.kind === 'table' && s.payload.records).toEqual([
      { deleted: false, values: ['abc'] }, { deleted: true, values: ['def'] }, { deleted: false, values: ['ghi'] },
    ]);
  });

  it('language driver selects the code page (0x01 cp437, 0x02 cp850, 0x03 cp1252)', () => {
    const fields = [{ name: 'T', type: 'C', length: 2 }];
    const body = [[0x20, 0x9b, 0x82]]; // byte 0x9B is cent in cp437, o-slash in cp850, a control-ish char in cp1252
    const text = (driver: number): string => {
      const s = decode(raw({ fields, records: [], recordBytes: body, driver }));
      return s.payload.kind === 'table' ? String(s.payload.records[0]?.values[0]) : '';
    };
    expect(text(1)).toBe('¢é');
    expect(text(2)).toBe('øé');
    expect(text(3)).toBe('›‚'); // cp1252: 0x9B ›, 0x82 ‚
  });

  it('unknown language driver assumes cp437 and warns once when a high byte is seen', () => {
    const fields = [{ name: 'T', type: 'C', length: 2 }];
    const s = decode(raw({ fields, records: [], recordBytes: [[0x20, 0x82, 0x82], [0x20, 0x82, 0x82]], driver: 0x65 }));
    expect(s.payload.kind === 'table' && s.payload.records.map((r) => r.values[0])).toEqual(['éé', 'éé']);
    expect(s.warnings.filter((w) => w.message.includes('language driver'))).toHaveLength(1);
    const clean = decode(raw({ fields, records: [' ab'], driver: 0x65 }));
    expect(clean.warnings).toEqual([]);
  });

  it('FoxPro version bytes decode with a warning; unknown versions throw', () => {
    const fields = [{ name: 'A', type: 'C', length: 1 }];
    expect(decode(raw({ fields, records: [' x'], version: 0x30 })).warnings.some((w) => w.message.includes('FoxPro'))).toBe(true);
    for (const v of [0x83, 0x8b, 0x04]) expect(decode(raw({ fields, records: [' x'], version: v })).warnings).toEqual([]);
    expect(() => decode(raw({ fields, records: [' x'], version: 0x02 }))).toThrow(ExhumeError);
  });

  it('record count larger than the data: decodes what is there and warns', () => {
    const fields = [{ name: 'A', type: 'C', length: 2 }];
    const s = decode(raw({ fields, records: [' ab', ' cd'], count: 5 }));
    expect(s.payload.kind === 'table' && s.payload.records).toHaveLength(2);
    expect(s.warnings.some((w) => /promises 5 records but 2/.test(w.message))).toBe(true);
  });

  it('record count smaller than the data: decodes every complete record and warns', () => {
    const fields = [{ name: 'A', type: 'C', length: 2 }];
    const s = decode(raw({ fields, records: [' ab', ' cd', ' ef'], count: 1 }));
    expect(s.payload.kind === 'table' && s.payload.records).toHaveLength(3);
    expect(s.warnings.some((w) => /promises 1 records but 3/.test(w.message))).toBe(true);
  });

  it('missing 0x1A end marker is a warning', () => {
    const fields = [{ name: 'A', type: 'C', length: 2 }];
    const s = decode(raw({ fields, records: [' ab'], eof: false }));
    expect(s.payload.kind === 'table' && s.payload.records).toHaveLength(1);
    expect(s.warnings.map((w) => w.message).join()).toMatch(/end marker/);
  });

  it('cut in the middle of a record keeps the complete records and warns', () => {
    const fields = [{ name: 'A', type: 'C', length: 4 }];
    const full = raw({ fields, records: [' abcd', ' efgh'] });
    const cut = full.slice(0, full.length - 4);
    const s = decode(cut);
    expect(s.payload.kind === 'table' && s.payload.records.map((r) => r.values[0])).toEqual(['abcd']);
    expect(s.warnings.length).toBeGreaterThan(0);
    expect(allInBounds(s.annotations, cut.length)).toBe(true);
  });

  it('cut inside the field descriptors warns about the missing terminator; cut inside the header throws', () => {
    const full = raw({ fields: ALL, records: [] });
    const s = decode(full.slice(0, 32 + 32 * 3 + 5));
    expect(s.warnings.some((w) => /terminator/.test(w.message))).toBe(true);
    expect(s.payload.kind === 'table' && s.payload.fields).toHaveLength(3);
    expect(() => decode(full.slice(0, 20))).toThrow(ExhumeError);
    expect(() => decode(full.slice(0, 32))).toThrow(ExhumeError); // no descriptors at all
  });

  it('header length beyond the file is a warning; a gap before the records is annotated as padding', () => {
    const fields = [{ name: 'A', type: 'C', length: 1 }];
    const bytes = raw({ fields, records: [] });
    bytes[8] = 0xff; bytes[9] = 0x0f;
    const s = decode(bytes);
    expect(s.warnings.some((w) => /header length/.test(w.message))).toBe(true);

    const padded = raw({ fields, records: [] });
    const withGap = Uint8Array.from([...padded.slice(0, 65), 9, 9, 9, ...padded.slice(65)]);
    withGap[8] = 68;
    const g = decode(withGap);
    expect(g.annotations.map((a) => a.label)).toContain('headerPadding');
    expect(coverage(g.annotations, withGap.length).exact).toBe(true);
  });

  it('unsupported field type is shown as text with a warning', () => {
    const s = decode(raw({ fields: [{ name: 'B', type: 'B', length: 2 }], records: [' hi'] }));
    expect(s.warnings.some((w) => /unsupported type/.test(w.message))).toBe(true);
    expect(s.payload.kind === 'table' && s.payload.fields[0]?.type).toBe('C');
  });

  it('annotates one group per field and per record with a leaf per value', () => {
    const bytes = raw({ fields: ALL.slice(0, 2), records: [' Ada      1.5'] });
    const s = decode(bytes);
    const fieldGroup = s.annotations.find((a) => a.label === 'fieldDescriptors')!;
    expect(fieldGroup.children?.map((c) => c.label)).toEqual(['field[0]', 'field[1]']);
    const rec = s.annotations.find((a) => a.label === 'records')!.children![0]!;
    expect(rec.label).toBe('record[0]');
    expect(rec.children?.map((c) => c.label)).toEqual(['flag', 'NAME', 'AGE']);
    expect(rec.children?.[1]?.value).toBe('"Ada"');
  });

  it('groups thousands of records in chunks and keeps the tiling exact', () => {
    const table: TablePayload = {
      kind: 'table', lastUpdate: '2000-01-01', fields: [{ name: 'N', type: 'N', length: 6, decimals: 0 }],
      records: Array.from({ length: 6100 }, (_, i) => ({ deleted: i % 7 === 0, values: [i] })),
    };
    const bytes = encode(table);
    const s = decode(bytes);
    expect(s.payload).toEqual(table);
    expect(s.warnings).toEqual([]);
    expect(coverage(s.annotations, bytes.length).exact).toBe(true);
    const recs = s.annotations.find((a) => a.label === 'records')!;
    expect(recs.children!.length).toBeLessThan(10);
  });
});

describe('dbf encode and detect', () => {
  const table: TablePayload = {
    kind: 'table', lastUpdate: '1999-12-31',
    fields: [
      { name: 'NAME', type: 'C', length: 6, decimals: 0 },
      { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
      { name: 'OK', type: 'L', length: 1, decimals: 0 },
      { name: 'WHEN', type: 'D', length: 8, decimals: 0 },
      { name: 'MEMO', type: 'M', length: 10, decimals: 0 },
    ],
    records: [
      { deleted: false, values: ['Café', -12.5, true, '1999-12-31', null] },
      { deleted: true, values: ['', null, null, null, null] },
    ],
  };

  it('writes a dBASE III file with the notes\' layout', () => {
    const b = encode(table);
    expect(b[0]).toBe(0x03);
    expect([b[1], b[2], b[3]]).toEqual([99, 12, 31]);
    expect(b[4]).toBe(2);
    expect(b[8]! | (b[9]! << 8)).toBe(32 + 32 * 5 + 1);
    expect(b[10]! | (b[11]! << 8)).toBe(1 + 6 + 8 + 1 + 8 + 10);
    expect(b[29]).toBe(0x01);
    expect(b[b.length - 1]).toBe(0x1a);
    expect(b[32 + 32 * 5]).toBe(0x0d);
    expect(decode(b).payload).toEqual(table);
  });

  it('rejects models that are not valid', () => {
    const bad = (t: Partial<TablePayload> & { fields?: TablePayload['fields'] }): void =>
      expect(() => encode({ ...table, ...t })).toThrow(ExhumeError);
    bad({ lastUpdate: '1899-12-31' });
    bad({ lastUpdate: '2000-02-30' });
    bad({ fields: [] , records: [] });
    bad({ records: [{ deleted: false, values: ['trailing ', 1, true, null, null] }] });
    bad({ records: [{ deleted: false, values: ['€', 1, true, null, null] }] });
    bad({ records: [{ deleted: false, values: ['x', 123456789, true, null, null] }] });
    bad({ records: [{ deleted: false, values: ['x', 0.1 + 0.2, true, null, null] }] });
    bad({ records: [{ deleted: false, values: ['x', 1, true, null, 'memo'] }] });
  });

  it('detect: 0.6 for a version byte, 0.8 with an aligned header length, +0.15 for .dbf', () => {
    const b = encode(table);
    expect(dbf.detect(b)).toBeCloseTo(0.8);
    expect(dbf.detect(b, 'x.DBF')).toBeCloseTo(0.95);
    const odd = b.slice();
    odd[8] = 100;
    expect(dbf.detect(odd)).toBeCloseTo(0.6);
    expect(dbf.detect(Uint8Array.of(1, 2, 3))).toBe(0);
    expect(dbf.detect(new Uint8Array(64).fill(0x55))).toBe(0);
    expect(dbf.detect(new Uint8Array(0), 'a.dbf')).toBeLessThanOrEqual(0.3);
  });
});
