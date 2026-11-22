#!/usr/bin/env node
// Records the demo video picture: drives the BUILT app (dist/) and the slides page in headless
// Chromium and saves the screen as timestamped JPEG frames (CDP screencast), on a timeline taken from
// the narration clip lengths. video/build.sh then joins frames and narration with ffmpeg.
//
//   node video/capture.mjs            (run from the repo root, after `npm run build` and narrate.sh)
//
// Playwright is not a dependency of this project: it is resolved from PLAYWRIGHT_FROM (a package.json
// next to a node_modules that has it), default ../package.json.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? path.resolve(ROOT, '../package.json'));
const { chromium } = require('playwright');

const GAP = 0.7; // seconds of silence between narration clips
// Longer silences where the picture has to leave one sample and open another.
const LEAD = { '02-drop': 0.9, '03-autopsy': 0.9, '04-lotus': 2.0, '05a-dbase': 2.7, '05b-wordstar': 2.8, '05c-damaged': 2.0, '06-spec': 1.3, '07-kiro': 0.8, '08-honest': 0.9, '09-close': 1.0 };
const KEYS = ['01-hook', '02-drop', '03-autopsy', '04-lotus', '05a-dbase', '05b-wordstar', '05c-damaged', '06-spec', '07-kiro', '08-honest', '09-close'];
const dur = Object.fromEntries(KEYS.map((k) => {
  const f = path.join(ROOT, 'video/nar', `${k}.voice.wav`);
  if (!fs.existsSync(f)) {
    // rehearsal without narration: estimate from the word count (about 2.5 words a second)
    const txt = path.join(ROOT, 'video/nar', `${k}.txt`);
    const words = fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').trim().split(/\s+/).length : 12;
    return [k, words / 2.5 + 1];
  }
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();
  return [k, Number(s)];
}));
const start = {};
let t = 1.0; // one second of picture before the first word
for (const k of KEYS) { t += (LEAD[k] ?? GAP) - GAP; start[k] = t; t += dur[k] + GAP; }
const TOTAL = t + 2.5; // the end card stays up after the last word
// Where each spoken line starts inside its clip (written by nar/gen_lines.py): the picture follows lines.
const lineMarks = Object.fromEntries(KEYS.map((k) => {
  const f = path.join(ROOT, 'video/nar', `${k}.lines.json`);
  return [k, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []];
}));
fs.mkdirSync(path.join(ROOT, 'video/out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'video/out/timeline.json'), JSON.stringify({ gap: GAP, total: TOTAL, start, dur }, null, 2));

// ---- static server: dist/ under /exhume/ (a sub-path, like GitHub Pages) and the slides ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = null;
  if (url === '/slides.html') file = path.join(ROOT, 'video/slides.html');
  else if (url.startsWith('/exhume/')) file = path.join(ROOT, 'dist', url.slice('/exhume/'.length) || 'index.html');
  if (!file || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const APP = `${BASE}/exhume/`;

const W = 1280, H = 720, SCALE = 1.5; // 1920x1080 frames
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, acceptDownloads: true, serviceWorkers: 'block' });
const page = await context.newPage();

// A visible pointer (headless Chromium draws none) and a "file being dragged" badge.
await page.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 8z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg><span id="demo-drag"></span>';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;transform:translate(640px,360px);filter:drop-shadow(0 2px 3px #000a)';
    document.documentElement.appendChild(c);
    const d = c.querySelector('#demo-drag');
    d.style.cssText = 'display:none;position:absolute;left:22px;top:18px;padding:5px 10px;border-radius:5px;background:#e8e4d8;color:#111;font:600 14px ui-monospace,Menlo,monospace;white-space:nowrap;box-shadow:0 6px 16px #000a';
    window.addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    window.demoDrag = (name) => { d.textContent = name ? `\u{1F4C4} ${name}` : ''; d.style.display = name ? 'block' : 'none'; };
  });
});

// ---- frame recording ----
const FRAMES = path.join(ROOT, 'video/frames');
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', (f) => {
  const name = `f${String(frames.length).padStart(6, '0')}.jpg`;
  fs.writeFileSync(path.join(FRAMES, name), Buffer.from(f.data, 'base64'));
  frames.push({ name, ts: f.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});

await page.goto(APP);
await page.waitForSelector('.stone');
await page.mouse.move(640, 600);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
const until = async (sec) => { const ms = (sec - now()) * 1000; if (ms > 0) await page.waitForTimeout(ms); };
const at = (key, frac) => start[key] + dur[key] * frac;
/** The moment line `n` (1-based) of a clip starts (or ends), plus an offset in seconds. */
const mk = (key, n) => { const m = lineMarks[key][n - 1]; if (!m) throw new Error(`no line ${n} in ${key}: run video/narrate.sh first`); return m; };
const ln = (key, n, off = 0) => start[key] + mk(key, n).start + off;
const end = (key, n, off = 0) => start[key] + mk(key, n).end + off;
let mouse = { x: 640, y: 600 };
const glide = async (x, y, ms = 700) => {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const k = i / steps; const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await page.waitForTimeout(ms / steps);
  }
  mouse = { x, y };
};
const centre = async (sel, nth = 0) => {
  const box = await page.locator(sel).nth(nth).boundingBox();
  if (!box) throw new Error(`not visible: ${sel}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const click = async (sel, nth = 0, ms = 650) => {
  await page.locator(sel).nth(nth).scrollIntoViewIfNeeded();
  const p = await centre(sel, nth);
  await glide(p.x, p.y, ms);
  await page.waitForTimeout(120);
  await page.mouse.click(p.x, p.y);
};
const scrollTo = (y, ms = 1200) => page.evaluate(([y, ms]) => new Promise((done) => {
  const y0 = window.scrollY; const t0 = performance.now();
  const tick = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; window.scrollTo(0, y0 + (y - y0) * e); k < 1 ? requestAnimationFrame(tick) : done(); };
  requestAnimationFrame(tick);
}), [y, ms]);
/** Drop a built-in sample on the page the way a user would drop a file (optionally cut short). */
const drop = async (file, as = file, cut = 0) => {
  await page.evaluate((n) => window.demoDrag(n), as);
  await glide(640, 300, 900);
  await page.evaluate(async ([file, as, cut]) => {
    const buf = new Uint8Array(await (await fetch(`./samples/${file}`)).arrayBuffer());
    const dt = new DataTransfer();
    dt.items.add(new File([cut ? buf.slice(0, cut) : buf], as));
    const main = document.querySelector('main');
    main.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise((r) => setTimeout(r, 900));
    window.demoDrag('');
    main.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [file, as, cut]);
  await page.waitForSelector('.specimen');
};
const home = async () => { await click('.specimen-head .btn-quiet', 0, 500); await page.waitForSelector('.stone'); };
const dig = async (file) => { await click(`button[aria-label*="${file}"]`, 0, 700); await page.waitForSelector('.specimen'); };

// ================= the timeline =================
// `until` waits for a point on the narration timeline; if the picture is running late it says so,
// so the leads below can be tuned. HOP is the time a "back to the graveyard, dig up a sample" takes.
const HOP = 2.6;
const mark = async (label, sec) => {
  const late = now() - sec;
  if (late > 0.25) console.log(`late by ${late.toFixed(2)} s at ${label}`);
  await until(sec);
};
const park = () => glide(1262, 706, 500); // pointer out of the way

// 01 hook: the question over the open grave, then the stones one by one, then the name
await mark('hook scroll', ln('01-hook', 4, 0.1));
await scrollTo(330, 2000);
await mark('hook macpaint', ln('01-hook', 5, -0.35)); await glide(175, 440, 700);
await mark('hook lotus', ln('01-hook', 6, -0.35)); await glide(736, 440, 800);
await mark('hook wordstar', ln('01-hook', 7, -0.35)); await glide(1096, 440, 700);
await mark('hook top', ln('01-hook', 8, -0.8)); await scrollTo(0, 1000);

// 02 drop: a MacPaint drawing (the drop lands as the first line ends)
await mark('drop', ln('02-drop', 1, 0.5));
await drop('GHOST.MAC');
await mark('drop look', ln('02-drop', 5, -0.2)); await glide(330, 360, 900);
await mark('drop scroll', ln('02-drop', 6, 0)); await scrollTo(260, 1500);
await mark('drop back', end('02-drop', 6, 0.1)); await scrollTo(0, 800);

// 03 autopsy
await mark('autopsy tab', ln('03-autopsy', 2, -0.5));
await click('[role="tab"]', 1, 600);
await mark('autopsy byte', ln('03-autopsy', 3, 0.2));
await click('.hex-row .byte', 16 * 5 + 4, 600);                  // a byte inside the brush patterns
await mark('autopsy bitmap', ln('03-autopsy', 6, -0.7));
await click('.tree-node:has-text("bitmap")', 0, 450);            // the compressed bitmap
await page.locator('.tree-row:has(.tree-node:has-text("bitmap")) .tree-twist').first().click();
await click('.tree-node:has-text("row 41")', 0, 450);            // one row of compressed pixels
await mark('autopsy map', ln('03-autopsy', 7, -0.7));
await scrollTo(0, 500);
await glide(640, 178, 700);                                      // the file map: every byte accounted for

// 04 lotus (the hop happens around the first line)
await mark('lotus hop', ln('04-lotus', 1, -1.7));
await home();
await dig('BUDGET87.WK1');
await mark('lotus formula', ln('04-lotus', 3, 0.3)); await click('#cell-3-4', 0, 600);   // E4: @SUM(B4..D4)
await mark('lotus if', ln('04-lotus', 6, -0.3)); await click('#cell-15-1', 0, 600);       // B16: @IF(...)
await mark('lotus export', ln('04-lotus', 7, 0.2)); await click('.export-buttons button:has-text("XLSX")', 0, 600);

// 05a dBASE: the deleted rows are still there
await mark('dbase hop', start['05a-dbase'] - 2.6);
await home();
await dig('RESIDENT.DBF');
await mark('dbase deleted', ln('05a-dbase', 2, -0.1)); await click('.table-content tbody tr', 3, 600);

// 05b WordStar
await mark('wordstar hop', start['05b-wordstar'] - 2.7);
await home();
await dig('LETTER.WS');
await mark('wordstar scroll', ln('05b-wordstar', 1, 0.6)); await scrollTo(230, 1500);

// 05c a damaged file: the same drawing, cut off after 7,000 bytes
await mark('damaged drop', start['05c-damaged'] - 1.9);
await drop('GHOST.MAC', 'DAMAGED.MAC', 7000);
await mark('damaged scroll', ln('05c-damaged', 1, 0.9)); await scrollTo(330, 1100);
await mark('coroner', ln('05c-damaged', 3, -0.6));
await scrollTo(0, 400);
await click('[role="tab"]', 2, 500);
await glide(420, 430, 900);

// 06-08 the Kiro slides
await mark('slides', start['06-spec'] - 1.0);
await page.goto(`${BASE}/slides.html`);
await page.evaluate(() => window.show('spec'));
await page.mouse.move(1262, 706); mouse = { x: 1262, y: 706 };
for (const [n, line] of [[1, 4], [2, 5], [3, 6], [4, 7]]) { await mark(`spec ${n}`, ln('06-spec', line, -0.1)); await page.evaluate((n) => window.step(n), n); }
await mark('kiro slide', start['07-kiro'] - 0.5);
await page.evaluate(() => window.show('kiro'));
for (const [n, line] of [[1, 1], [2, 3], [3, 4], [4, 6]]) { await mark(`kiro ${n}`, ln('07-kiro', line, 0)); await page.evaluate((n) => window.step(n), n); }
await mark('honest slide', start['08-honest'] - 0.5);
await page.evaluate(() => window.show('honest'));
for (const [n, line] of [[1, 2], [2, 4]]) { await mark(`honest ${n}`, ln('08-honest', line, 0)); await page.evaluate((n) => window.step(n), n); }

// 09 close: the graveyard once more, then the end card on the last line
await mark('close', start['09-close'] - 0.6);
await page.goto(APP);
await page.waitForSelector('.stone');
await page.mouse.move(1262, 706); mouse = { x: 1262, y: 706 };
await mark('close scroll', ln('09-close', 1, 0.3)); await scrollTo(330, 2600);
await mark('end card', ln('09-close', 5, -0.6));
await page.goto(`${BASE}/slides.html#end`);
await mark('end', TOTAL);
if (now() > TOTAL + 0.3) console.log(`picture ran ${(now() - TOTAL).toFixed(2)} s over the narration`);

await cdp.send('Page.stopScreencast');
const endTs = Date.now() / 1000;
await browser.close();
server.close();

// ffmpeg concat list: each frame lasts until the next one arrives.
let list = 'ffconcat version 1.0\n';
for (let i = 0; i < frames.length; i++) {
  const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
  list += `file '${frames[i].name}'\nduration ${Math.max(0.001, next - frames[i].ts).toFixed(4)}\n`;
}
list += `file '${frames[frames.length - 1].name}'\n`;
fs.writeFileSync(path.join(FRAMES, 'frames.ffconcat'), list);
fs.writeFileSync(path.join(ROOT, 'video/out/timeline.json'), JSON.stringify({ gap: GAP, total: TOTAL, start, dur, pictureLead: T0 / 1000 - frames[0].ts }, null, 2));
console.log(`captured ${frames.length} frames over ${TOTAL.toFixed(1)} s`);
console.log('CAPTURE_DONE');
