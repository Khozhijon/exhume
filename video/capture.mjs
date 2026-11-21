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
const KEYS = ['01-hook', '02-drop', '03-autopsy', '04-lotus', '05-more', '06-spec', '07-kiro', '08-honest', '09-close'];
const dur = Object.fromEntries(KEYS.map((k) => {
  const f = path.join(ROOT, 'video/nar', `${k}.voice.wav`);
  if (!fs.existsSync(f)) {
    // rehearsal without narration: estimate from the word count (about 2.5 words a second)
    const words = fs.readFileSync(path.join(ROOT, 'video/nar', `${k}.txt`), 'utf8').trim().split(/\s+/).length;
    return [k, words / 2.5 + 1];
  }
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();
  return [k, Number(s)];
}));
const start = {};
let t = 1.0; // one second of picture before the first word
for (const k of KEYS) { start[k] = t; t += dur[k] + GAP; }
const TOTAL = t + 1.5;
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
// 01 hook: the graveyard
await until(at('01-hook', 0.30));
await scrollTo(330, 2200);
await glide(190, 420, 900);
await until(at('01-hook', 0.55)); await glide(520, 430, 1200);   // MacPaint ... Lotus
await until(at('01-hook', 0.72)); await glide(1090, 430, 1400);  // ... WordStar
await until(at('01-hook', 0.90)); await scrollTo(0, 1200);

// 02 drop: a MacPaint drawing
await until(start['02-drop'] + 0.2);
await drop('GHOST.MAC');
await until(at('02-drop', 0.50)); await glide(330, 330, 900);
await until(at('02-drop', 0.62)); await scrollTo(250, 1500);
await until(at('02-drop', 0.86)); await scrollTo(0, 900);

// 03 autopsy
await until(start['03-autopsy'] - 0.2);
await click('[role="tab"]', 1);
await until(at('03-autopsy', 0.30));
await click('.hex-row .byte', 16 * 5 + 4);                       // a byte inside the brush patterns
await until(at('03-autopsy', 0.52));
await click('.tree-node:has-text("bitmap")', 0);                 // the compressed bitmap
await page.locator('.tree-row:has(.tree-node:has-text("bitmap")) .tree-twist').first().click();
await until(at('03-autopsy', 0.68));
await click('.tree-node:has-text("row 41")', 0);
await until(at('03-autopsy', 0.86));
await glide(640, 178, 800);                                      // the file map: every byte accounted for

// 04 lotus
await until(start['04-lotus'] - 1.6);
await home();
await dig('BUDGET87.WK1');
await until(at('04-lotus', 0.32)); await click('#cell-3-4');     // E4: @SUM(B4..D4)
await until(at('04-lotus', 0.52)); await click('#cell-15-1');    // B16: @IF(...)
await until(at('04-lotus', 0.78)); await click('.export-buttons button:has-text("XLSX")');

// 05 more: dBASE, WordStar, a damaged file
await until(start['05-more'] - 1.6);
await home();
await dig('RESIDENT.DBF');
await until(at('05-more', 0.14)); await click('.table-content tbody tr', 3);   // a deleted row, still there
await until(at('05-more', 0.30));
await home();
await dig('LETTER.WS');
await until(at('05-more', 0.42)); await scrollTo(260, 1500);
await until(at('05-more', 0.60));
await drop('GHOST.MAC', 'DAMAGED.MAC', 7000);                    // the same drawing, cut off after 7,000 bytes
await until(at('05-more', 0.78)); await click('[role="tab"]', 2);
await glide(420, 420, 900);

// 06-08 the Kiro slides
await until(start['06-spec'] - 0.5);
await page.goto(`${BASE}/slides.html`);
await page.evaluate(() => window.show('spec'));
for (const [n, f] of [[1, 0.16], [2, 0.42], [3, 0.62], [4, 0.74]]) { await until(at('06-spec', f)); await page.evaluate((n) => window.step(n), n); }
await until(start['07-kiro'] - 0.4);
await page.evaluate(() => window.show('kiro'));
for (const [n, f] of [[1, 0.02], [2, 0.26], [3, 0.52], [4, 0.82]]) { await until(at('07-kiro', f)); await page.evaluate((n) => window.step(n), n); }
await until(start['08-honest'] - 0.4);
await page.evaluate(() => window.show('honest'));
for (const [n, f] of [[1, 0.05], [2, 0.42]]) { await until(at('08-honest', f)); await page.evaluate((n) => window.step(n), n); }

// 09 close: the graveyard once more, then the end card
await until(start['09-close'] - 0.4);
await page.goto(APP);
await page.waitForSelector('.stone');
await page.mouse.move(640, 640);
await until(at('09-close', 0.10)); await scrollTo(330, 2500);
await until(at('09-close', 0.62));
await page.goto(`${BASE}/slides.html#end`);
await until(TOTAL);

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
