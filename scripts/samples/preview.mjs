// Writes each sample picture as a binary PPM (P6) into the directory given by argv[2].
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ghostMac, pumpkinPcx, moonIff } from './images.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/samples/preview.mjs <outdir>');
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

function ppm(img) {
  const head = Buffer.from(`P6\n${img.width} ${img.height}\n255\n`, 'ascii');
  const body = Buffer.alloc(img.width * img.height * 3);
  for (let i = 0; i < img.pixels.length; i++) {
    const [r, g, b] = img.palette[img.pixels[i]];
    body[i * 3] = r;
    body[i * 3 + 1] = g;
    body[i * 3 + 2] = b;
  }
  return Buffer.concat([head, body]);
}

for (const [name, fn] of [['ghost', ghostMac], ['pumpkin', pumpkinPcx], ['moon', moonIff]]) {
  writeFileSync(join(dir, `${name}.ppm`), ppm(fn()));
}
console.log('wrote previews to', dir);
