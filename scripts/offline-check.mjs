#!/usr/bin/env node
// Real offline check of the BUILT app (dist/), served under a sub-path like GitHub Pages:
// first visit online, wait for "Offline ready", cut the network, reload, open every sample.
//
//   npm run build && node scripts/offline-check.mjs
//
// Playwright is not a dependency of this project: it is resolved from PLAYWRIGHT_FROM (a package.json
// next to a node_modules that has it), default ../package.json.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? path.resolve(ROOT, '../package.json'));
const { chromium } = require('playwright');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!url.startsWith('/exhume/')) { res.writeHead(404); res.end('not found'); return; }
  const file = path.join(ROOT, 'dist', url.slice('/exhume/'.length) || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const APP = `http://127.0.0.1:${server.address().port}/exhume/`;

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(APP);
await page.waitForSelector('.stone');
const ready = await page.waitForSelector('.offline-ready', { timeout: 15000 }).then(() => true, () => false);
check('first visit: the page reports "Offline ready"', ready);
const stored = await page.evaluate(async () => {
  const out = [];
  for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
  return out;
});
check('scripts and styles of the first visit are stored', stored.some((p) => p.endsWith('.js')) && stored.some((p) => p.endsWith('.css')), stored.join(' '));

await context.setOffline(true);
server.close(); // and the server is gone as well
const reloaded = await page.reload().then(() => true, () => false);
check('offline: the page reloads', reloaded);
const stones = await page.waitForSelector('.stone', { timeout: 10000 }).then(() => page.locator('.stone').count(), () => 0);
check('offline: the graveyard renders with six stones', stones === 6, `${stones} stones`);
for (const file of ['GHOST.MAC', 'PUMPKIN.PCX', 'MOON.IFF', 'BUDGET87.WK1', 'RESIDENT.DBF', 'LETTER.WS']) {
  await page.locator('.stone', { hasText: file }).click();
  const opened = await page.waitForSelector('.tabs', { timeout: 10000 }).then(() => true, () => false);
  const title = opened ? (await page.locator('h1').first().innerText()).trim() : '';
  check(`offline: ${file} opens`, opened && title === file, title);
  await page.goto(APP).catch(() => {});
  await page.waitForSelector('.stone', { timeout: 10000 }).catch(() => {});
}
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'offline check passed');
process.exit(failed ? 1 : 0);
