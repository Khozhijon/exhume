#!/usr/bin/env node
// Interoperability check against INDEPENDENT implementations (not part of the app, not a dependency):
//   - ffmpeg's PCX and IFF ILBM codecs: it must decode our sample files to the same pixels we do, and
//     we must decode PCX files that ffmpeg writes (1-bit, 8-bit palette, 24-bit) to the same pixels.
//   - SheetJS (the `xlsx` npm package), if it can be resolved from INTEROP_MODULES: it must read the same
//     cell values from our Lotus WK1 and dBASE samples, and must read our exported XLSX workbook back
//     with the same values and formulas.
// Run after `npm run build:core`:
//   node scripts/interop.mjs                       (ffmpeg checks only)
//   INTEROP_MODULES=/some/dir/with/node_modules node scripts/interop.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const reg = await import(path.join(ROOT, 'mcp/dist/core/registry.js'));
const ex = await import(path.join(ROOT, 'mcp/dist/export/index.js'));
const { translateToExcel } = await import(path.join(ROOT, 'mcp/dist/formats/wk1/excel.js'));
const sample = (f) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/samples', f)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exhume-interop-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); if (!ok) failed++; };
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { maxBuffer: 1 << 28 });
const rgbOf = (file) => ff(['-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const ours = (p) => {
  const out = new Uint8Array(p.width * p.height * 3);
  for (let i = 0; i < p.width * p.height; i++) {
    const c = p.bitsPerPixel === 24 ? [p.pixels[i * 3], p.pixels[i * 3 + 1], p.pixels[i * 3 + 2]] : p.palette[p.pixels[i]];
    out.set(c, i * 3);
  }
  return out;
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---- ffmpeg ----
for (const f of ['PUMPKIN.PCX', 'MOON.IFF']) {
  const { specimen } = reg.exhume(sample(f), f);
  check(`ffmpeg decodes our ${f} to the pixels we decode`, same(ours(specimen.payload), rgbOf(path.join(ROOT, 'public/samples', f))));
}
const ghost = reg.exhume(sample('GHOST.MAC'), 'GHOST.MAC').specimen.payload;
const pumpkin = reg.exhume(sample('PUMPKIN.PCX'), 'PUMPKIN.PCX').specimen.payload;
fs.writeFileSync(path.join(tmp, 'ghost.png'), ex.encodePng(ghost));
fs.writeFileSync(path.join(tmp, 'pumpkin.png'), ex.encodePng(pumpkin));
check('ffmpeg reads our PNG export of GHOST.MAC to the pixels we decode', same(ours(ghost), rgbOf(path.join(tmp, 'ghost.png'))));
for (const [name, src, fmt, extra] of [['1-bit', 'ghost.png', 'monob', []], ['8-bit palette', 'pumpkin.png', 'pal8', []], ['24-bit', 'ghost.png', 'rgb24', ['-vf', 'scale=200:150']]]) {
  const file = path.join(tmp, `ff-${fmt}.pcx`);
  ff(['-i', path.join(tmp, src), ...extra, '-pix_fmt', fmt, file]);
  const { module, specimen } = reg.exhume(new Uint8Array(fs.readFileSync(file)), 'x.pcx');
  check(`we decode a ${name} PCX written by ffmpeg to the pixels ffmpeg decodes`, module.id === 'pcx' && specimen.warnings.length === 0 && same(ours(specimen.payload), rgbOf(file)));
}

// ---- SheetJS ----
let XLSX = null;
try { XLSX = createRequire(path.join(process.env.INTEROP_MODULES ?? ROOT, 'package.json'))('xlsx'); } catch { /* not installed */ }
if (!XLSX) {
  console.log('skip SheetJS checks (set INTEROP_MODULES to a folder where `npm install xlsx` was run)');
} else {
  const close = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);
  // Lotus WK1
  const sheet = reg.exhume(sample('BUDGET87.WK1'), 'BUDGET87.WK1').specimen.payload;
  const ws = XLSX.read(sample('BUDGET87.WK1'), { type: 'array' });
  const s1 = ws.Sheets[ws.SheetNames[0]];
  let bad = 0; let n = 0;
  for (const c of sheet.cells) {
    if (c.type === 'blank' || c.align === 'repeat') continue;
    const theirs = s1[XLSX.utils.encode_cell({ c: c.col, r: c.row })];
    n++;
    if (!theirs || !close(theirs.v, c.value)) { bad++; if (bad < 4) console.log('   differs at', c.col, c.row, 'ours', c.value, 'theirs', theirs?.v); }
  }
  check(`SheetJS reads the same ${n} cell values from BUDGET87.WK1`, bad === 0);
  // dBASE
  const table = reg.exhume(sample('RESIDENT.DBF'), 'RESIDENT.DBF').specimen.payload;
  const wd = XLSX.read(sample('RESIDENT.DBF'), { type: 'array', cellDates: false, raw: true });
  const rows = XLSX.utils.sheet_to_json(wd.Sheets[wd.SheetNames[0]], { header: 1, raw: true });
  const live = table.records.filter((r) => !r.deleted);
  let badT = rows[0].join() === table.fields.map((f) => f.name).join() ? 0 : 1;
  live.forEach((r, i) => r.values.forEach((v, j) => {
    const t = rows[i + 1]?.[j];
    const f = table.fields[j];
    if (f.type === 'D') return; // SheetJS turns dates into serial numbers; compared by count only
    if (!close(typeof v === 'string' ? v : v, typeof t === 'string' ? t.trimEnd() : t)) { badT++; if (badT < 4) console.log('   differs', i, f.name, 'ours', v, 'theirs', t); }
  }));
  check(`SheetJS reads the same ${live.length} live records from RESIDENT.DBF (${table.records.length - live.length} deleted ones only we show)`, badT === 0 && rows.length - 1 === live.length);
  // our XLSX export, read back
  const { bytes } = ex.toXlsx(sheet, { translateFormula: translateToExcel });
  const back = XLSX.read(bytes, { type: 'array', cellFormula: true, cellNF: true });
  const b1 = back.Sheets[back.SheetNames[0]];
  let badX = 0; let formulas = 0;
  for (const c of sheet.cells) {
    if (c.type === 'blank') continue;
    const cell = b1[XLSX.utils.encode_cell({ c: c.col, r: c.row })];
    if (!cell || !close(cell.v, c.value)) badX++;
    if (c.type === 'formula') { formulas++; if (cell?.f !== translateToExcel(c.formula)) badX++; }
  }
  check(`SheetJS reads our XLSX export back: same values, ${formulas} formulas intact`, badX === 0);
  check('the date cell in our XLSX carries a date format', /d-mmm-yy/i.test(b1.B18?.z ?? ''), b1.B18?.z ?? 'no format');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} check(s) failed` : 'all interoperability checks passed');
process.exit(failed ? 1 : 0);
