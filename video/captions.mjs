#!/usr/bin/env node
// Writes video/out/exhume-demo.srt (captions for YouTube) from the narration text and the timeline.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'video/out/timeline.json'), 'utf8'));
const read = (k) => fs.readFileSync(path.join(ROOT, 'video/nar', `${k}.txt`), 'utf8').trim();
// what is said, written the way it should be read (the narration files spell some words phonetically)
const tidy = (s) => s.replace(/Keero/g, 'Kiro').replace(/dee base/g, 'dBASE').replace(/Mac Paint/g, 'MacPaint').replace(/M C P/g, 'MCP')
  .replace(/Lotus one two three/g, 'Lotus 1-2-3').replace(/fan fold/g, 'fan-fold');
const more = tidy(read('05-more')).match(/[^.]+\./g).map((x) => x.trim());
const text = { '05a-dbase': more[0], '05b-wordstar': more[1], '05c-damaged': more.slice(2).join(' ') };
const stamp = (t) => { const ms = Math.round(t * 1000); const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
let n = 0; let out = '';
for (const k of Object.keys(tl.start)) {
  const sentences = (text[k] ?? tidy(read(k))).match(/[^.?!:]+[.?!:]+/g).map((x) => x.trim());
  const chars = sentences.reduce((a, x) => a + x.length, 0);
  let t = tl.start[k];
  for (const sentence of sentences) {
    const d = tl.dur[k] * (sentence.length / chars);
    out += `${++n}\n${stamp(t)} --> ${stamp(t + d - 0.05)}\n${sentence}\n\n`;
    t += d;
  }
}
fs.writeFileSync(path.join(ROOT, 'video/out/exhume-demo.srt'), out);
console.log(`${n} captions`);
