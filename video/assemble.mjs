#!/usr/bin/env node
// Joins the narration takes into clips WITHOUT touching their speed or pitch.
// (The first version slowed fast lines down with a time-stretch; that made the voice stutter, so the
// pace now comes only from the writing, the choice of take and the pauses.)
//
//   node video/assemble.mjs     (after video/narrate.sh has generated and measured the takes)
//
// Reads nar/script.json and nar/lines/measures.json (written by nar/gen_lines.py), chooses a take per
// line, cuts the silence around it with a generous margin, and writes nar/<clip>.voice.wav and
// nar/<clip>.lines.json (where each line starts and ends).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.join(path.dirname(new URL(import.meta.url).pathname), 'nar');
const script = JSON.parse(fs.readFileSync(path.join(HERE, 'script.json'), 'utf8'));
const measures = JSON.parse(fs.readFileSync(path.join(HERE, 'lines/measures.json'), 'utf8'));
const D = script.defaults;
const SR = 24000;
const PAD = 0.09;          // seconds kept before and after the detected speech, so no consonant is cut
const FADE = 0.02;
const PAUSE_SCALE = D.pauseScale ?? 1;
const NAME = /\bexh?[iu]+me?d?s?\b/i; // exhume, exhumed, exume, exhum, exium

const opt = (line, k) => line[k] ?? D[k];
const pyNum = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n)); // Python prints 1.0, JS prints 1
const lineId = (line) => createHash('sha1').update(`${line.say}|${pyNum(opt(line, 'ex'))}|${pyNum(opt(line, 'cfg'))}|${pyNum(opt(line, 'temp'))}`).digest('hex').slice(0, 10);
const tidy = (s) => s.replace(/Keero/g, 'Kiro').replace(/dee base/g, 'dBASE').replace(/Mac Paint/g, 'MacPaint').replace(/M C P/g, 'MCP')
  .replace(/Lotus one two three/g, 'Lotus 1-2-3').replace(/fan fold/g, 'fan-fold');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const pcm = (file) => { const b = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 }); return new Int16Array(b.buffer, b.byteOffset, b.length / 2); };
const wav = (file, samples) => {
  const h = Buffer.alloc(44); const n = samples.length * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + n, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(n, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(samples.buffer, samples.byteOffset, n)]));
};

let speech = 0; let words = 0; let pauses = 0; const report = [];
for (const clip of script.clips) {
  const parts = []; const marks = []; let pos = 0;
  report.push(`== ${clip.key}`);
  clip.lines.forEach((line, i) => {
    const takes = []; const id = lineId(line);
    for (let t = 1; t <= opt(line, 'takes'); t++) { const name = `${clip.key}-${id}-t${t}.wav`; if (measures[name]) takes.push({ name, m: measures[name] }); }
    if (!takes.length) throw new Error(`no measured take for ${clip.key} line ${i + 1}: ${line.say} (run video/narrate.sh)`);
    const best = Math.max(...takes.map((t) => t.m.sim)); const med = median(takes.map((t) => t.m.dur));
    const sane = (t) => t.m.dur <= 1.5 * med + 0.3;
    let ok = takes.filter((t) => t.m.sim >= best - 0.03 && sane(t));
    if (/exhume/i.test(line.say)) { const named = takes.filter((t) => NAME.test(t.m.heard) && sane(t)); if (named.length) ok = named; }
    if (!ok.length) ok = [takes.reduce((a, b) => (b.m.sim > a.m.sim ? b : a))];
    // lively pitch is good; a take that races past the pace this line asks for is not
    const target = opt(line, 'wps');
    const score = (t) => t.m.st_std - 2.0 * Math.max(0, t.m.wps - target);
    const pick = ok.reduce((a, b) => (score(b) > score(a) ? b : a));
    const all = pcm(path.join(HERE, 'lines', pick.name));
    const k = SR / pick.m.sr; const pad = Math.round(PAD * SR);
    const a = Math.max(0, Math.round(pick.m.a * k) - pad); const b = Math.min(all.length, Math.round(pick.m.b * k) + pad);
    const seg = Int16Array.from(all.subarray(a, b));
    const fade = Math.round(FADE * SR);
    for (let j = 0; j < fade && j < seg.length; j++) { seg[j] = Math.round(seg[j] * (j / fade)); seg[seg.length - 1 - j] = Math.round(seg[seg.length - 1 - j] * (j / fade)); }
    marks.push({ start: +(pos / SR).toFixed(3), end: +((pos + seg.length) / SR).toFixed(3), say: line.say, show: line.show ?? tidy(line.say) });
    parts.push(seg); pos += seg.length;
    const pause = i + 1 < clip.lines.length ? opt(line, 'pause') * PAUSE_SCALE : 0;
    if (pause) { const gap = new Int16Array(Math.round(pause * SR)); parts.push(gap); pos += gap.length; pauses += pause; }
    const n = line.say.split(/\s+/).length; speech += pick.m.dur; words += n;
    report.push(`  ${i + 1}. take ${pick.name.slice(-5, -4)} of ${takes.length}  ${pick.m.dur.toFixed(1)} s  ${pick.m.wps.toFixed(1)} words/s  pitch sd ${pick.m.st_std.toFixed(1)} st  pause ${pause.toFixed(2)}  | ${pick.m.heard}`);
  });
  const out = new Int16Array(pos); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  wav(path.join(HERE, `${clip.key}.voice.wav`), out);
  fs.writeFileSync(path.join(HERE, `${clip.key}.lines.json`), JSON.stringify(marks, null, 1));
  report.push(`  -> ${clip.key}.voice.wav ${(pos / SR).toFixed(1)} s`);
}
report.push('', `${words} words, ${speech.toFixed(1)} s of speech (${(words / speech).toFixed(2)} words/s while speaking, no time-stretch), ${pauses.toFixed(1)} s of pauses inside clips`);
fs.writeFileSync(path.join(HERE, 'takes-report.txt'), report.join('\n') + '\n');
console.log(report.filter((l) => l.startsWith('  ->') || /words,/.test(l)).join('\n'));
