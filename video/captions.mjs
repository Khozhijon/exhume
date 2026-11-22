#!/usr/bin/env node
// Writes video/out/exhume-demo.srt (captions for YouTube): one caption per spoken line, timed from the
// line marks that nar/gen_lines.py wrote and the timeline that capture.mjs wrote.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'video/out/timeline.json'), 'utf8'));
const stamp = (t) => { const ms = Math.round(t * 1000); const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
let n = 0; let out = '';
for (const k of Object.keys(tl.start)) {
  const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'video/nar', `${k}.lines.json`), 'utf8'));
  lines.forEach((line, i) => {
    // a caption stays up through the pause after its line, but never into the next line
    const next = i + 1 < lines.length ? lines[i + 1].start - 0.05 : line.end + 0.4;
    out += `${++n}\n${stamp(tl.start[k] + line.start)} --> ${stamp(tl.start[k] + Math.min(line.end + 0.5, next))}\n${line.show}\n\n`;
  });
}
fs.writeFileSync(path.join(ROOT, 'video/out/exhume-demo.srt'), out);
console.log(`${n} captions`);
