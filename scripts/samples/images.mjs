// Pixel models for the three built-in image specimens (GHOST.MAC, PUMPKIN.PCX, MOON.IFF).
// Plain Node ESM, no dependencies, fully deterministic (seeded PRNG, no Date/Math.random).
// Each exported function returns an ImagePayload-shaped object; another script encodes the files.

// ---------------------------------------------------------------- small utilities
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bayer(n) {
  let m = [[0]];
  let s = 1;
  const off = [[0, 2], [3, 1]];
  while (s < n) {
    const t = [];
    for (let y = 0; y < s * 2; y++) {
      const row = [];
      for (let x = 0; x < s * 2; x++) {
        row.push(4 * m[y % s][x % s] + off[(y / s) | 0][(x / s) | 0]);
      }
      t.push(row);
    }
    m = t;
    s *= 2;
  }
  return m;
}
const BAY8 = bayer(8);
const BAY4 = bayer(4);
const dith4 = (x, y) => (BAY4[y & 3][x & 3] + 0.5) / 16;
const dith8 = (x, y) => (BAY8[y & 7][x & 7] + 0.5) / 64;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- 5x7 bitmap font
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
};

/** font5x7: char -> array of 7 row bitmasks (bit 4 = leftmost column, 5 columns). */
export const font5x7 = {};
for (const [ch, rows] of Object.entries(GLYPHS)) {
  font5x7[ch] = rows.map((r) => parseInt(r.replace(/#/g, '1').replace(/\./g, '0'), 2));
}

/** Width in pixels of `text` at `scale` (6 px advance per glyph, no trailing gap). */
export function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}

/**
 * Draw `text` (A-Z, 0-9, space, '.', '-') with its top-left at (x, y), each font pixel
 * scale x scale device pixels, writing `value` into `pixels` (row-major, `width` wide).
 * Clips to the buffer. Returns the x just after the last glyph.
 */
export function drawText(pixels, width, x, y, text, scale, value) {
  const height = Math.floor(pixels.length / width);
  let cx = x;
  for (const raw of String(text)) {
    const g = font5x7[raw.toUpperCase()] || font5x7[' '];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (!((g[r] >> (4 - col)) & 1)) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + col * scale + sx;
            const py = y + r * scale + sy;
            if (px >= 0 && px < width && py >= 0 && py < height) pixels[py * width + px] = value;
          }
        }
      }
    }
    cx += 6 * scale;
  }
  return cx;
}

// ---------------------------------------------------------------- canvas + shapes
function makeCanvas(w, h, init = 0) {
  return { w, h, px: new Uint8Array(w * h).fill(init) };
}

// paint: number | 8-byte pattern (Uint8Array) | (x,y)=>number (negative = skip)
function paintAt(paint, x, y) {
  if (typeof paint === 'number') return paint;
  if (paint instanceof Uint8Array) return (paint[y & 7] >> (7 - (x & 7))) & 1;
  return paint(x, y);
}

function fill(c, x0, y0, x1, y1, test, paint) {
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(c.w, Math.ceil(x1));
  y1 = Math.min(c.h, Math.ceil(y1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (test(x + 0.5, y + 0.5)) {
        const v = paintAt(paint, x, y);
        if (v >= 0) c.px[y * c.w + x] = v;
      }
    }
  }
}
const rect = (c, x0, y0, x1, y1, paint) => fill(c, x0, y0, x1, y1, () => true, paint);
const discT = (cx, cy, r) => (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
const ellT = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const rotEllT = (cx, cy, rx, ry, a) => {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = (dx * ca + dy * sa) / rx;
    const v = (-dx * sa + dy * ca) / ry;
    return u * u + v * v <= 1;
  };
};
const unionT = (...ts) => (x, y) => ts.some((t) => t(x, y));
const growT = (t, r) => {
  const offs = [];
  for (const rr of [r * 0.5, r]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      offs.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
  }
  return (x, y) => t(x, y) || offs.some(([dx, dy]) => t(x + dx, y + dy));
};
function polyT(pts) {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}
function bbox(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
function disc(c, cx, cy, r, paint) {
  fill(c, cx - r - 1, cy - r - 1, cx + r + 2, cy + r + 2, discT(cx, cy, r), paint);
}
function ellipse(c, cx, cy, rx, ry, paint) {
  fill(c, cx - rx - 1, cy - ry - 1, cx + rx + 2, cy + ry + 2, ellT(cx, cy, rx, ry), paint);
}
function poly(c, pts, paint) {
  const [x0, y0, x1, y1] = bbox(pts);
  fill(c, x0 - 1, y0 - 1, x1 + 2, y1 + 2, polyT(pts), paint);
}
function line(c, xa, ya, xb, yb, th, paint) {
  const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) * 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    disc(c, xa + (xb - xa) * t, ya + (yb - ya) * t, th / 2, paint);
  }
}

// ---------------------------------------------------------------- 8x8 patterns
function bayerPat(level) {
  const p = new Uint8Array(8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) if (BAY8[y][x] < level) p[y] |= 0x80 >> x;
  }
  return p;
}
const pat = (...b) => Uint8Array.from(b);
const invert = (p) => Uint8Array.from(p, (v) => ~v & 255);
const CHECKER = pat(0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55);
const BRICKS = pat(0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08);
const WEAVE = pat(0xf8, 0x74, 0x22, 0x47, 0x8f, 0x17, 0x22, 0x71);
const DIAG = pat(0x88, 0x44, 0x22, 0x11, 0x88, 0x44, 0x22, 0x11);
const STRIPES_H = pat(0xff, 0xff, 0, 0, 0xff, 0xff, 0, 0);
const STRIPES_V = pat(0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc, 0xcc);

// Classic-looking extras appended after the patterns the picture actually used.
const CATALOG = [
  pat(255, 255, 255, 255, 255, 255, 255, 255), // solid black
  pat(0, 0, 0, 0, 0, 0, 0, 0), // white
  CHECKER, // 50%
  pat(0x88, 0x00, 0x22, 0x00, 0x88, 0x00, 0x22, 0x00), // 12%
  pat(0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22), // 25%
  pat(0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77), // 75%
  pat(0xff, 0, 0xff, 0, 0xff, 0, 0xff, 0), // thin horizontal stripes
  pat(0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa), // thin vertical stripes
  STRIPES_H,
  STRIPES_V,
  DIAG,
  pat(0x11, 0x22, 0x44, 0x88, 0x11, 0x22, 0x44, 0x88), // reverse diagonal
  BRICKS,
  invert(BRICKS),
  WEAVE,
  pat(0xff, 0x88, 0x88, 0x88, 0xff, 0x88, 0x88, 0x88), // grid
  pat(0x10, 0x28, 0x44, 0x82, 0x44, 0x28, 0x10, 0x00), // diamonds
  pat(0x81, 0x42, 0x24, 0x18, 0x81, 0x42, 0x24, 0x18), // zigzag
  pat(0xf0, 0xf0, 0xf0, 0xf0, 0x0f, 0x0f, 0x0f, 0x0f), // big checker
  pat(0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01), // single diagonal
  pat(0x3c, 0x42, 0x81, 0x81, 0x81, 0x81, 0x42, 0x3c), // rings
  pat(0xe0, 0xc0, 0x80, 0x0e, 0x0c, 0x08, 0xe0, 0xc0), // scatter
  pat(0x77, 0x77, 0x77, 0x00, 0xdd, 0xdd, 0xdd, 0x00), // tiles
  invert(DIAG),
  invert(CHECKER),
  invert(STRIPES_V),
  ...[2, 6, 10, 14, 18, 20, 24, 28, 36, 40, 44, 48, 52, 56, 60].map(bayerPat),
];

// ================================================================= GHOST.MAC
export function ghostMac() {
  const W = 576;
  const H = 720;
  const c = makeCanvas(W, H, 0);
  const rnd = mulberry32(1984);

  // pattern registry: patterns actually used come first in the final table
  const used = [];
  const seen = new Set();
  const P = (p) => {
    const k = Array.from(p).join(',');
    if (!seen.has(k)) {
      seen.add(k);
      used.push(p);
    }
    return p;
  };
  const BP = (l) => P(bayerPat(l));

  // ---- sky: bands of ordered-dither patterns, black at the zenith
  const skyLevels = [64, 62, 60, 58, 55, 52, 49, 46, 43];
  skyLevels.forEach((l, i) => rect(c, 0, i * 60, W, (i + 1) * 60, BP(l)));
  rect(c, 0, skyLevels.length * 60, W, H, BP(43));

  const MX = 474;
  const MY = 124;
  const MR = 62;
  const GX = 288;

  // ---- stars
  const star = (x, y, size) => {
    rect(c, x, y, x + 1, y + 1, 0);
    if (size >= 1) {
      rect(c, x - 1, y, x + 2, y + 1, 0);
      rect(c, x, y - 1, x + 1, y + 2, 0);
    }
    if (size >= 2) {
      rect(c, x - 3, y, x + 4, y + 1, 0);
      rect(c, x, y - 3, x + 1, y + 4, 0);
    }
  };
  let placed = 0;
  let guard = 0;
  while (placed < 46 && guard++ < 4000) {
    const x = 14 + Math.floor(rnd() * (W - 28));
    const y = 12 + Math.floor(rnd() * 380);
    const dm = Math.hypot(x - MX, y - MY);
    const inGhost = x > 170 && x < 410 && y > 100 && y < 400;
    if (dm < MR + 52 || inGhost) continue;
    const r = rnd();
    star(x, y, r < 0.2 ? 2 : r < 0.65 ? 1 : 0);
    placed++;
  }

  // ---- moon with halo rings, terminator shading and craters
  disc(c, MX, MY, MR + 38, BP(50));
  disc(c, MX, MY, MR + 24, BP(38));
  disc(c, MX, MY, MR + 11, BP(26));
  disc(c, MX, MY, MR, 0);
  const moonT = discT(MX, MY, MR);
  fill(c, MX - MR, MY - MR, MX + MR, MY + MR, (x, y) => moonT(x, y) && !discT(MX - 28, MY - 8, MR)(x, y), BP(10));
  fill(c, MX - MR, MY - MR, MX + MR, MY + MR, (x, y) => moonT(x, y) && !discT(MX - 13, MY - 4, MR)(x, y), BP(26));
  for (const [cx, cy, r] of [[448, 104, 12], [494, 140, 10], [462, 158, 7], [486, 100, 5], [440, 142, 7], [510, 116, 4]]) {
    disc(c, cx, cy, r, BP(22));
    disc(c, cx + 2, cy + 2, Math.max(1, r - 3), BP(40));
    disc(c, cx - 1, cy - 1, Math.max(1, r - 5), 0);
  }

  // ---- back hill (near-black, moonlit rim)
  const hillB = (x) => 470 + 18 * Math.sin(x / 80 + 0.6) + 9 * Math.sin(x / 31 + 1);
  const hillBT = (x, y) => y >= hillB(x);
  fill(c, 0, 380, W, H, hillBT, BP(60));
  fill(c, 0, 380, W, H, (x, y) => hillBT(x, y) && !hillBT(x, y - 3), BP(22));

  // ---- fence on the back hill: rails first, then pointed pickets
  for (const off of [2, 30]) {
    const t = (x, y) => y >= hillB(x) + off && y < hillB(x) + off + 7;
    fill(c, 0, 380, W, 600, growT(t, 1.5), 1);
    fill(c, 0, 380, W, 600, t, 0);
  }
  for (let xk = -4; xk < W; xk += 24) {
    const xc = xk + 8;
    const top = hillB(xc) - 36;
    const bottom = hillB(xc) + 46;
    const t = (x, y) =>
      x >= xk && x <= xk + 16 && ((y >= top + 11 && y <= bottom) || (y >= top && y < top + 11 && Math.abs(x - xc) <= (y - top) * 0.75));
    fill(c, xk - 3, top - 3, xk + 20, bottom + 3, growT(t, 1.6), 1);
    fill(c, xk, top, xk + 17, bottom + 1, t, 0);
    fill(c, xk, top, xk + 17, bottom + 1, (x, y) => t(x, y) && x > xk + 11, BP(16));
  }

  // ---- front ground
  const hillF = (x) => 592 + 12 * Math.sin(x / 95 + 2) + 5 * Math.sin(x / 33);
  const groundT = (x, y) => y >= hillF(x);
  fill(c, 0, 560, W, 664, groundT, BP(52));
  fill(c, 0, 560, W, 664, (x, y) => groundT(x, y) && !groundT(x, y - 3), BP(18));
  const tuft = (x, y, h) => {
    line(c, x, y, x - 3, y - h, 1, 0);
    line(c, x, y, x, y - h - 3, 1, 0);
    line(c, x, y, x + 3, y - h, 1, 0);
  };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = hillF(x) + 8 + rnd() * (650 - hillF(x) - 8);
    tuft(Math.floor(x), Math.floor(y), 4 + Math.floor(rnd() * 5));
  }

  // ---- tombstones
  const stone = (o) => {
    const { body, x0, x1, top, bot, base, bands } = o;
    fill(c, x0 - 5, top - 5, x1 + 5, bot + 5, growT(body, 3), 1);
    fill(c, x0, top, x1 + 1, bot + 1, body, base);
    for (const [from, pattern] of bands) {
      fill(c, x0, top, x1 + 1, bot + 1, (x, y) => body(x, y) && x > x1 - from, pattern);
    }
    // moss at the foot, ragged edge
    fill(c, x0, top, x1 + 1, bot + 1, (x, y) => body(x, y) && y > bot - 30 + 7 * Math.sin(x / 7), BP(34));
    // sparse stone speckle
    for (let i = 0; i < 26; i++) {
      const sx = x0 + 8 + Math.floor(rnd() * (x1 - x0 - 16));
      const sy = top + 20 + Math.floor(rnd() * (bot - top - 60));
      if (body(sx, sy)) rect(c, sx, sy, sx + 2, sy + 1, 1);
    }
  };
  const archBody = (x0, x1, top, ry, bot) => {
    const cx = (x0 + x1) / 2;
    const hw = (x1 - x0) / 2;
    return (x, y) => x >= x0 && x <= x1 && y <= bot && (y >= top + ry || ((x - cx) / hw) ** 2 + ((y - top - ry) / ry) ** 2 <= 1);
  };

  // left stone (rounded, cross)
  const L = { x0: 40, x1: 158, top: 470, ry: 48, bot: 620 };
  stone({ ...L, body: archBody(L.x0, L.x1, L.top, L.ry, L.bot), base: BP(14), bands: [[34, BP(28)], [18, BP(44)]] });
  rect(c, 96, 512, 102, 586, 1);
  rect(c, 80, 530, 118, 536, 1);
  fill(c, L.x0, L.top, L.x0 + 8, L.bot, (x, y) => archBody(L.x0, L.x1, L.top, L.ry, L.bot)(x, y) && y > L.top + 30 && y < L.bot - 40, 0);

  // right stone (chamfered slab, cracked)
  const R = { x0: 418, x1: 536, top: 454, bot: 624 };
  const slab = polyT([[R.x0, 506], [R.x0 + 18, R.top], [R.x1 - 18, R.top], [R.x1, 506], [R.x1, R.bot], [R.x0, R.bot]]);
  stone({ ...R, body: slab, base: BP(14), bands: [[34, BP(28)], [18, BP(44)]] });
  for (const [xa, ya, xb, yb] of [[484, 478, 470, 506], [470, 506, 482, 528], [482, 528, 462, 566], [470, 506, 452, 520]]) {
    line(c, xa, ya, xb, yb, 2, 1);
  }

  // centre stone (large, white face for the lettering) + brick plinth
  const C = { x0: 176, x1: 400, top: 404, ry: 58, bot: 612 };
  stone({
    ...C,
    body: archBody(C.x0, C.x1, C.top, C.ry, C.bot),
    base: 0,
    bands: [[40, BP(8)], [26, BP(22)], [12, BP(40)]],
  });
  const plinth = (x, y) => x >= 158 && x <= 418 && y >= 586 && y <= 618;
  fill(c, 150, 578, 428, 628, growT(plinth, 3), 1);
  fill(c, 158, 586, 419, 619, plinth, BRICKS);
  P(BRICKS);

  // lettering on the centre stone
  const stoneTxt = (text, y, s) => drawText(c.px, W, Math.round(GX - textWidth(text, s) / 2), y, text, s, 1);
  stoneTxt('R.I.P.', 446, 4);
  rect(c, 214, 484, 362, 486, 1);
  rect(c, 224, 489, 352, 490, 1);
  stoneTxt('MACPAINT', 500, 3);
  stoneTxt('1984-1988', 536, 3);
  rect(c, 224, 568, 352, 569, 1);

  // tufts at the stone feet
  for (const [a, b] of [[34, 164], [412, 542], [150, 426]]) {
    for (let x = a; x < b; x += 6 + Math.floor(rnd() * 5)) {
      tuft(x, Math.floor(hillF(x)) + 34 + Math.floor(rnd() * 8), 6 + Math.floor(rnd() * 6));
    }
  }

  // ---- the ghost
  const gy = 220;
  const rw = 74;
  const hemY = 324;
  const lobeW = (2 * rw) / 4;
  const hem = (x) => {
    const f = (x - (GX - rw)) / lobeW;
    return hemY + 15 * Math.sin(Math.PI * (f - Math.floor(f)));
  };
  const dome = (x, y) => y < gy && (x - GX) ** 2 + (y - gy) ** 2 <= rw * rw;
  const body = (x, y) => y >= gy && Math.abs(x - GX) <= rw && y <= hem(x);
  const armL = rotEllT(GX - rw - 2, gy + 26, 36, 13, 0.55);
  const armR = rotEllT(GX + rw + 2, gy + 26, 36, 13, -0.55);
  const ghost = unionT(dome, body, armL, armR);
  const GB = [GX - rw - 50, gy - rw - 6, GX + rw + 50, hemY + 22];
  // vapour trail towards the grave
  for (const [x, y, r] of [[282, 372, 7], [296, 387, 5], [286, 398, 3]]) {
    disc(c, x, y, r + 2, 1);
    disc(c, x, y, r, 0);
  }
  fill(c, GB[0] - 4, GB[1] - 4, GB[2] + 4, GB[3] + 4, growT(ghost, 3), 1);
  fill(c, GB[0], GB[1], GB[2], GB[3], ghost, 0);
  fill(c, GB[0], GB[1], GB[2], GB[3], (x, y) => ghost(x, y) && x > GX + 34, BP(10));
  fill(c, GB[0], GB[1], GB[2], GB[3], (x, y) => ghost(x, y) && x > GX + 52, BP(26));
  // eyes with highlights, smile, cheeks
  for (const s of [-1, 1]) {
    ellipse(c, GX + s * 27, gy + 2, 11, 18, 1);
    disc(c, GX + s * 27 - 3, gy - 6, 3.5, 0);
    ellipse(c, GX + s * 47, gy + 30, 11, 6, CHECKER);
  }
  P(CHECKER);
  fill(c, GX - 25, gy + 30, GX + 25, gy + 62, (x, y) => y >= gy + 38 && ellT(GX, gy + 38, 24, 21)(x, y), 1);
  fill(c, GX - 14, gy + 50, GX + 14, gy + 64, (x, y) => y >= gy + 50 && ellT(GX, gy + 58, 12, 8)(x, y) && ellT(GX, gy + 38, 23, 20)(x, y), BP(28));

  // ---- caption band
  rect(c, 0, 662, W, H, 1);
  rect(c, 0, 664, W, 666, 0);
  rect(c, 0, 669, W, 677, CHECKER);
  rect(c, 0, 677, W, 679, 0);
  const cap = 'DRAWN FOR EXHUME';
  drawText(c.px, W, Math.round((W - textWidth(cap, 3)) / 2), 686, cap, 3, 0);

  // ---- pattern table: used ones first, then the classic catalog, exactly 38
  const patterns = [...used];
  const key = (p) => Array.from(p).join(',');
  const have = new Set(patterns.map(key));
  for (const p of CATALOG) {
    if (patterns.length >= 38) break;
    if (!have.has(key(p))) {
      have.add(key(p));
      patterns.push(p);
    }
  }
  return {
    kind: 'image',
    width: W,
    height: H,
    bitsPerPixel: 1,
    palette: [[255, 255, 255], [0, 0, 0]],
    pixels: c.px,
    patterns: patterns.slice(0, 38).map((p) => Uint8Array.from(p)),
  };
}

// ================================================================= PUMPKIN.PCX
function lerpStops(stops, t) {
  t = clamp(t, 0, 1);
  const seg = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
}
function rampColors(stops, n) {
  return Array.from({ length: n }, (_, i) => lerpStops(stops, i / (n - 1)));
}

function pumpkinPalette() {
  const pal = [];
  pal.push(...rampColors([[0, 0, 0], [26, 6, 40], [66, 18, 92]], 16)); //   0-15 black -> purple
  pal.push(...rampColors([[66, 18, 92], [110, 34, 120], [168, 64, 120]], 16)); // 16-31 purple -> plum glow
  pal.push(...rampColors([[22, 8, 2], [70, 26, 4], [150, 62, 6], [226, 104, 12]], 16)); // 32-47 brown -> orange
  pal.push(...rampColors([[226, 104, 12], [255, 140, 20], [255, 182, 54], [255, 218, 110]], 16)); // 48-63 orange -> light
  pal.push(...rampColors([[90, 14, 2], [200, 56, 6], [255, 150, 20], [255, 214, 60]], 16)); // 64-79 inner glow
  pal.push(...rampColors([[8, 28, 6], [30, 84, 16], [90, 158, 30], [170, 214, 80]], 16)); // 80-95 greens
  pal.push(...rampColors([[24, 12, 4], [80, 46, 16], [166, 116, 56]], 16)); // 96-111 stem browns
  pal.push(...rampColors([[0, 0, 0], [255, 255, 255]], 16)); // 112-127 greys
  pal.push(...rampColors([[255, 214, 60], [255, 244, 150], [255, 255, 235]], 16)); // 128-143 hot core
  pal.push(...rampColors([[40, 4, 4], [120, 16, 8], [200, 40, 10]], 16)); // 144-159 crease reds
  const extra = [
    [[0, 0, 0], [20, 50, 120], [110, 170, 255]], // blue
    [[0, 0, 0], [10, 90, 90], [110, 230, 220]], // cyan
    [[0, 0, 0], [110, 20, 100], [240, 110, 220]], // magenta
    [[0, 0, 0], [140, 30, 60], [255, 150, 170]], // pink
    [[0, 0, 0], [80, 80, 20], [210, 210, 90]], // olive
    [[0, 0, 0], [120, 90, 60], [240, 220, 180]], // sand
  ];
  for (const e of extra) pal.push(...rampColors(e, 16)); // 160-255
  return pal;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) { s += src[y * w + xx]; n++; }
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

export function pumpkinPcx() {
  const W = 320;
  const H = 200;
  const c = makeCanvas(W, H, 0);
  const px = c.px;
  const palette = pumpkinPalette();
  const CX = 160;
  const CY = 114;
  const RX = 124;
  const RY = 74;
  const ramp = (base, n, v, x, y) => base + clamp(Math.floor(clamp(v, 0, 1) * (n - 1) + dith4(x, y)), 0, n - 1);

  // ---- backdrop: dark purple sky fading to black, lit ground, ground shadow
  const HORIZON = 164;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = (x + 0.5 - CX) / 160;
      const gy = (y + 0.5 - CY) / 112;
      const glow = Math.exp(-(gx * gx + gy * gy) * 2.2);
      let b;
      if (y < HORIZON) {
        b = 0.5 * Math.pow(1 - y / HORIZON, 1.15) + 0.2 * glow;
      } else {
        const t = (y - HORIZON) / (H - HORIZON);
        b = 0.13 - 0.05 * t + 0.4 * glow * (1 - t * 0.4);
        // shadow beneath the pumpkin
        const sx = (x + 0.5 - CX) / 130;
        const sy = (y + 0.5 - 188) / 12;
        const sd = Math.sqrt(sx * sx + sy * sy);
        b *= 0.12 + 0.88 * smooth(0.55, 1.0, sd);
      }
      px[y * W + x] = ramp(0, 32, b, x, y);
    }
  }

  // ---- ribbed pumpkin body (seven ribs shaded as a lit sphere with bulging lobes)
  const NR = 7;
  const Lx = -0.5;
  const Ly = -0.55;
  const Lz = 0.67;
  const ln = Math.hypot(Lx, Ly, Lz);
  const body = new Float32Array(W * H).fill(-1); // shade value or -1 if outside
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const X = (x + 0.5 - CX) / RX;
      const Y = (y + 0.5 - CY) / RY;
      const q = 1 - Y * Y;
      if (X * X + Y * Y > 1) continue;
      const u = X / Math.sqrt(Math.max(q, 1e-6));
      const k = clamp(Math.floor(((u + 1) / 2) * NR), 0, NR - 1);
      const s = (((u + 1) / 2) * NR - k) * 2 - 1;
      const Z = Math.sqrt(Math.max(0, 1 - X * X - Y * Y));
      const sq = Math.sqrt(Math.max(q, 0));
      let nx = X * 0.65 + s * 0.75 * sq;
      let ny = Y * 0.95;
      let nz = Z * 0.9 + 0.25;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      const dot = (nx * Lx + ny * Ly + nz * Lz) / ln;
      let v = 0.2 + 0.85 * clamp(dot, 0, 1);
      const crease = Math.abs(s);
      if (crease > 0.78) v *= 1 - ((crease - 0.78) / 0.22) * 0.55;
      v *= 0.82 + 0.18 * Z; // darker towards the silhouette
      body[y * W + x] = clamp(v, 0, 1);
    }
  }

  // ---- face cut-outs (symmetric about x = 160)
  const mirror = (pts) => pts.map(([x, y]) => [2 * CX - x, y]);
  const eyeL = [[96, 100], [142, 100], [124, 60]];
  const eyeR = mirror(eyeL);
  const nose = [[CX, 104], [147, 126], [173, 126]];
  const mouthYu = (dx) => 134 + 15 * (1 - (dx / 74) ** 2);
  const mouthYl = (dx) => mouthYu(dx) + 27 * Math.pow(Math.max(0, 1 - (dx / 74) ** 2), 0.75);
  const upperTeeth = [-48, -24, 0, 24, 48];
  const lowerTeeth = [-36, -12, 12, 36];
  const mouthT = (x, y) => {
    const dx = x - CX;
    if (Math.abs(dx) > 74) return false;
    const yu = mouthYu(dx);
    const yl = mouthYl(dx);
    if (y < yu || y > yl) return false;
    for (const t of upperTeeth) {
      if (Math.abs(dx - t) < 8 * (1 - (y - yu) / 13) && y - yu < 13) return false;
    }
    for (const t of lowerTeeth) {
      if (Math.abs(dx - t) < 7 * (1 - (yl - y) / 11) && yl - y < 11) return false;
    }
    return true;
  };
  const comps = [
    { t: polyT(eyeL), cx: 120, cy: 90, hw: 26, hh: 26 },
    { t: polyT(eyeR), cx: 200, cy: 90, hw: 26, hh: 26 },
    { t: polyT(nose), cx: CX, cy: 118, hw: 14, hh: 14 },
    { t: mouthT, cx: CX, cy: 154, hw: 78, hh: 26 },
  ];
  const holeId = new Int8Array(W * H).fill(-1);
  const holeMask = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let i = 0; i < comps.length; i++) {
        if (comps[i].t(x + 0.5, y + 0.5)) {
          holeId[y * W + x] = i;
          holeMask[y * W + x] = 1;
          break;
        }
      }
    }
  }
  const spill = boxBlur(boxBlur(holeMask, W, H, 7), W, H, 7);
  // rim darkening just outside the cut edge
  const rim = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (holeId[y * W + x] >= 0) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < W && yy >= 0 && yy < H && holeId[yy * W + xx] >= 0) { near = true; break; }
        }
      }
      rim[y * W + x] = near ? 1 : 0;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (holeId[i] >= 0) {
        const k = comps[holeId[i]];
        const d = clamp(Math.hypot((x + 0.5 - k.cx) / k.hw, (y + 0.5 - k.cy) / k.hh), 0, 1);
        const v = Math.pow(1 - d, 0.7);
        px[i] = v > 0.72 ? ramp(128, 16, (v - 0.72) / 0.28, x, y) : ramp(64, 16, v / 0.72 * 0.95 + 0.05, x, y);
      } else if (body[i] >= 0) {
        let v = body[i];
        v = v + 0.55 * spill[i] * (1 - v * 0.4);
        if (rim[i]) v *= 0.62;
        px[i] = ramp(32, 32, v, x, y);
      }
    }
  }

  // ---- stem: stamped discs along a bezier, cylinder-shaded green
  const stamp = (cx, cy, r, base, n, light) => {
    fill(c, cx - r - 1, cy - r - 1, cx + r + 2, cy + r + 2, discT(cx, cy, r), (x, y) => {
      const off = clamp((x + 0.5 - cx) / r, -1, 1);
      const v = Math.sqrt(1 - off * off) * 0.55 + (-off * 0.45 * light) + 0.1;
      return ramp(base, n, v, x, y);
    });
  };
  // dimple where the stem meets the body
  ellipse(c, CX, 45, 24, 6, (x, y) => ramp(96, 16, 0.12 + 0.2 * dith4(x, y), x, y));
  const bez = (t, p0, p1, p2) => [
    (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
    (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
  ];
  const P0 = [CX - 1, 52];
  const P1 = [CX - 12, 26];
  const P2 = [CX + 16, 8];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const [sx, sy] = bez(t, P0, P1, P2);
    stamp(sx, sy, 10.5 - 4.5 * t, 80, 16, 1);
  }
  // ridges
  for (let i = 4; i < 60; i += 9) {
    const [sx, sy] = bez(i / 60, P0, P1, P2);
    line(c, sx - 8 + 3 * (i / 60), sy, sx + 7 - 3 * (i / 60), sy - 1, 1, (x, y) => ramp(80, 16, 0.08, x, y));
  }
  // cut top
  ellipse(c, P2[0] + 0.5, P2[1] + 1, 6.5, 3.2, (x, y) => ramp(96, 16, 0.55 + 0.2 * dith4(x, y), x, y));
  // curled tendril
  const T0 = [CX + 10, 46];
  const T1 = [CX + 30, 52];
  const T2 = [CX + 48, 36];
  for (let i = 0; i <= 30; i++) {
    const [sx, sy] = bez(i / 30, T0, T1, T2);
    stamp(sx, sy, 2.1, 80, 16, 1);
  }
  const SPX = T2[0] - 13;
  const SPY = T2[1];
  for (let i = 0; i <= 90; i++) {
    const th = (i / 90) * Math.PI * 3.6;
    const r = 13 * (1 - i / 105);
    stamp(SPX + r * Math.cos(th), SPY + r * Math.sin(th), 2 - 0.5 * (i / 90), 80, 16, 1);
  }

  return { kind: 'image', width: W, height: H, bitsPerPixel: 8, palette, pixels: px };
}

// ================================================================= MOON.IFF
export function moonIff() {
  const W = 320;
  const H = 256;
  const c = makeCanvas(W, H, 0);
  const px = c.px;
  const rnd = mulberry32(1987);

  // 32-colour palette
  // 0-15 sky copper bands (deep blue -> purple -> orange -> pale horizon)
  // 16-20 moon, 21 silhouette, 22-24 hills/ground, 25-26 stars, 27-29 halo, 30-31 spare accents
  const palette = [
    [4, 4, 26], [8, 8, 42], [14, 12, 60], [22, 16, 78],
    [34, 20, 94], [52, 24, 106], [76, 28, 112], [104, 32, 110],
    [134, 40, 100], [164, 52, 84], [194, 70, 64], [220, 96, 48],
    [240, 128, 40], [250, 164, 56], [255, 200, 98], [255, 226, 150],
    [255, 250, 226], [238, 232, 204], [210, 204, 182], [176, 172, 158],
    [150, 148, 144], [8, 4, 16], [62, 28, 84], [38, 18, 60],
    [22, 12, 36], [255, 255, 255], [196, 200, 255], [90, 70, 134],
    [128, 108, 170], [172, 152, 196], [255, 120, 60], [120, 30, 56],
  ];
  const SIL = 21;
  const HZ = 214;

  // ---- sky bars with ordered-dither seams
  for (let y = 0; y < H; y++) {
    const v = clamp((y / HZ) * 15, 0, 15);
    const base = Math.floor(v);
    const f = v - base;
    for (let x = 0; x < W; x++) {
      const k = smooth(0.35, 0.9, f) > dith4(x, y) ? 1 : 0;
      px[y * W + x] = Math.min(15, base + k);
    }
  }

  // ---- stars (dark part of the sky only)
  const MX = 224;
  const MY = 92;
  const MR = 46;
  let n = 0;
  let guard = 0;
  while (n < 30 && guard++ < 2000) {
    const x = 4 + Math.floor(rnd() * (W - 8));
    const y = 4 + Math.floor(rnd() * 104);
    if (Math.hypot(x - MX, y - MY) < MR + 44) continue;
    px[y * W + x] = rnd() < 0.7 ? 25 : 26;
    if (rnd() < 0.18) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px[(y + dy) * W + x + dx] = 26;
    }
    n++;
  }

  // ---- moon: dithered halo, shaded disc, maria and craters
  for (let y = MY - MR - 44; y < MY + MR + 44; y++) {
    for (let x = MX - MR - 44; x < MX + MR + 44; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x + 0.5 - MX, y + 0.5 - MY);
      if (d > MR && d < MR + 40) {
        const h = 1 - (d - MR) / 40;
        if (h * h * 0.9 > dith8(x, y)) px[y * W + x] = h > 0.66 ? 29 : h > 0.33 ? 28 : 27;
      }
    }
  }
  for (let y = MY - MR; y <= MY + MR; y++) {
    for (let x = MX - MR; x <= MX + MR; x++) {
      const dx = x + 0.5 - MX;
      const dy = y + 0.5 - MY;
      if (dx * dx + dy * dy > MR * MR) continue;
      const s = (dx * 0.62 + dy * 0.5) / MR; // light from upper left
      let v = 16 + smooth(0.1, 0.55, s) * 1 + smooth(0.55, 0.95, s) * 1 + smooth(0.88, 1.0, s) * 1;
      const frac = v - Math.floor(v);
      v = Math.floor(v) + (frac > dith4(x, y) ? 1 : 0);
      px[y * W + x] = Math.min(19, Math.floor(v));
    }
  }
  const moonT = discT(MX, MY, MR - 1);
  // maria
  for (const [cx, cy, rx, ry, a] of [[MX - 14, MY - 10, 17, 11, 0.4], [MX + 8, MY + 14, 15, 9, -0.3], [MX - 22, MY + 12, 8, 6, 0]]) {
    fill(c, cx - rx - 1, cy - ry - 1, cx + rx + 2, cy + ry + 2, (x, y) => moonT(x, y) && rotEllT(cx, cy, rx, ry, a)(x, y), (x, y) => ((x + y) & 1 ? 18 : 17));
  }
  // craters (dark floor, lit rim edge)
  for (const [cx, cy, r] of [[MX + 22, MY - 18, 8], [MX - 28, MY - 20, 6], [MX + 26, MY + 12, 5], [MX - 6, MY + 30, 6], [MX + 10, MY - 4, 3], [MX - 30, MY + 4, 3]]) {
    disc(c, cx, cy, r, 19);
    disc(c, cx + 1, cy + 1, r - 2, 18);
    disc(c, cx + 1.5, cy + 1.5, Math.max(1, r - 4), 17);
  }

  // ---- distant hills, mid hills, ground
  const hFar = (x) => 204 + 11 * Math.sin(x / 55 + 0.5) + 5 * Math.sin(x / 19);
  const hMid = (x) => 218 + 8 * Math.sin(x / 41 + 2) + 4 * Math.sin(x / 13);
  const gnd = (x) => 234 + 2.5 * Math.sin(x / 70);
  fill(c, 0, 180, W, H, (x, y) => y >= hFar(x), 22);
  fill(c, 0, 180, W, H, (x, y) => y >= hFar(x) - 2 && y < hFar(x) && ((Math.floor(x) + Math.floor(y)) & 1) === 0, 22);
  fill(c, 0, 190, W, H, (x, y) => y >= hMid(x), 23);
  fill(c, 0, 190, W, H, (x, y) => y >= hMid(x) - 2 && y < hMid(x) && ((Math.floor(x) + Math.floor(y)) & 1) === 0, 23);
  fill(c, 0, 220, W, H, (x, y) => y >= gnd(x), 24);

  // ---- bare tree, recursive branching with seeded jitter
  const twig = (x, y, r) => disc(c, x, y, r, SIL);
  function branch(x, y, ang, len, th, depth) {
    const steps = Math.max(4, Math.floor(len));
    let cx = x;
    let cy = y;
    let a = ang;
    for (let i = 0; i < steps; i++) {
      a += (rnd() - 0.5) * 0.14;
      cx += (Math.cos(a) * len) / steps;
      cy += (Math.sin(a) * len) / steps;
      twig(cx, cy, Math.max(0.95, (th * (1 - (i / steps) * 0.3)) / 2));
    }
    if (depth <= 0) return;
    const kids = depth > 3 ? 2 : rnd() < 0.5 ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const spread = kids === 2 ? (k === 0 ? -1 : 1) * (0.42 + rnd() * 0.3) : (k - 1) * (0.55 + rnd() * 0.2);
      branch(cx, cy, a + spread, len * (0.72 + rnd() * 0.06), Math.max(1, th * 0.68), depth - 1);
    }
  }
  // flared root
  poly(c, [[70, 238], [80, 222], [98, 222], [112, 238]], SIL);
  branch(90, 226, -Math.PI / 2 + 0.06, 44, 11, 7);
  // a dropped side limb
  branch(92, 192, -Math.PI + 0.5, 30, 4, 4);

  // ---- picket fence silhouette
  rect(c, 0, 227, W, 231, SIL);
  rect(c, 0, 243, W, 247, SIL);
  for (let x = 0; x < W; x += 12) {
    const top = 212 + (((x / 12) | 0) % 5 === 0 ? -6 : 0) + Math.floor(rnd() * 3);
    poly(c, [[x, top + 7], [x + 3.5, top], [x + 7, top + 7]], SIL);
    rect(c, x, top + 7, x + 7, H, SIL);
  }
  rect(c, 0, 250, W, H, SIL);

  // ---- bats
  const bat = (bx, by, s, flap) => {
    const wing = flap
      ? [[1, 0], [4, -5], [10, -8], [18, -9], [14, -4], [16, 0], [11, -1], [8, 3], [5, 0], [2, 3]]
      : [[1, 0], [4, 3], [10, 7], [17, 9], [14, 4], [16, 0], [11, 1], [8, -2], [5, 1], [2, -2]];
    for (const m of [1, -1]) {
      poly(c, wing.map(([x, y]) => [bx + m * x * s, by + y * s]), SIL);
    }
    ellipse(c, bx, by, 2.4 * s, 4.2 * s, SIL);
    disc(c, bx, by - 4 * s, 2.2 * s, SIL);
    poly(c, [[bx - 2.4 * s, by - 5 * s], [bx - 1.8 * s, by - 8.5 * s], [bx - 0.4 * s, by - 5.5 * s]], SIL);
    poly(c, [[bx + 2.4 * s, by - 5 * s], [bx + 1.8 * s, by - 8.5 * s], [bx + 0.4 * s, by - 5.5 * s]], SIL);
  };
  bat(262, 62, 1.5, true);
  bat(112, 40, 1.0, false);
  bat(296, 30, 0.8, true);

  return { kind: 'image', width: W, height: H, bitsPerPixel: 8, palette, pixels: px };
}
