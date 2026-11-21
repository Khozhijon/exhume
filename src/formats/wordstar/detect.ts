// Structural WordStar detection (there is no magic number).
const MAX_SCAN = 1 << 20;
const TOGGLE_CONTROLS = new Set([0x02, 0x04, 0x13, 0x14, 0x16, 0x18, 0x19]);
const OTHER_CONTROLS = new Set([0x08, 0x09, 0x0a, 0x0c, 0x0d, 0x0f, 0x1b, 0x1e, 0x1f]);
const KNOWN_DOT = /^\.(PA|HE|FO|OP|PN|MT|MB|LH|PL|PO|CP|LM|RM|UJ|IG|HM|FM|H1|H2|H3|F1|F2|F3|PC|OJ|CW|SR|BP|MG)\b/i;

const isAlnum = (c: number): boolean => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);

/**
 * Signals: high-bit bytes that mark the last character of a word (printable low 7 bits, followed by a space,
 * punctuation, a control byte or a soft return); spaces and line ends that follow such a mark; the soft
 * return 0x8D 0x0A; known dot commands. No NUL bytes. Pure 7-bit text without dot commands is not WordStar.
 */
export function detectWordStar(bytes: Uint8Array, fileName?: string): number {
  const end = Math.min(bytes.length, MAX_SCAN);
  if (end === 0 || bytes[0] === 0x1a) return 0;
  let scanned = 0;

  let high = 0; // marked bytes (excluding 0x8D 0x8A 0xA0)
  let good = 0; // marks that sit where a word ends
  let bounds = 0; // spaces and line ends after some content
  let marked = 0; // ... of which follow a mark
  let soft = false;
  let weird = 0;
  const dots = new Set<string>();
  let lineStart = true;
  let prev = -1; // previous byte that is not a toggle
  for (let i = 0; i < end; i++) {
    const b = bytes[i]!;
    if (b === 0x1a) break;
    scanned = i + 1;
    if (b === 0x1d && i + 3 <= end) {
      // WordStar 5 symmetrical sequence: its length bytes and payload are not text
      const close = i + 3 + (bytes[i + 1]! | (bytes[i + 2]! << 8));
      if (close < end && bytes[close] === 0x1d) {
        i = close;
        continue;
      }
    }
    if (b === 0) return 0;
    if (lineStart && b === 0x2e) {
      const m = KNOWN_DOT.exec(String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(end, i + 8)), (x) => x & 0x7f)));
      while (i < end && bytes[i] !== 0x0a && bytes[i] !== 0x1a) i++;
      if (bytes[i] === 0x1a) break;
      if (m) dots.add(m[1]!.toUpperCase());
      lineStart = true;
      prev = -1;
      continue;
    }
    lineStart = false;
    const low = b & 0x7f;
    if (b >= 0x80 && b !== 0x8d && b !== 0x8a && b !== 0xa0) {
      high++;
      const nx = bytes[i + 1];
      const sep = nx === undefined || nx === 0x20 || nx === 0xa0 || nx === 0x8d || nx === 0x8a || nx < 0x20 || (nx > 0x20 && nx < 0x7f && !isAlnum(nx));
      if (low > 0x20 && low < 0x7f && sep) good++;
    }
    if (b === 0x8d && bytes[i + 1] === 0x0a) soft = true;
    if (b < 0x20 && !TOGGLE_CONTROLS.has(b) && !OTHER_CONTROLS.has(b)) weird++;
    if (b === 0x20 || b === 0xa0 || b === 0x8d || (b === 0x0d && bytes[i + 1] === 0x0a)) {
      if (prev !== -1 && prev !== 0x0a && prev !== 0x0d) {
        bounds++;
        if (prev >= 0x80) marked++;
      }
    }
    if (b === 0x0a) lineStart = bytes[i - 1] === 0x0d; // after a hard return only
    if (!TOGGLE_CONTROLS.has(b)) prev = b;
    if (b === 0x0a) prev = 0x0a;
  }
  if (weird > scanned * 0.02) return 0;

  const pairRatio = high > 0 ? good / high : 0;
  const coverage = bounds > 0 ? marked / bounds : high > 0 ? 1 : 0;
  let score: number;
  if (high > 0 && pairRatio >= 0.8 && coverage >= 0.8) score = 0.5 + 0.2 * Math.min(1, good / 8);
  else score = 0.1 * pairRatio * coverage;
  if (soft) score += 0.15;
  score += Math.min(0.2, 0.1 * dots.size);
  if (high === 0 && dots.size === 0) score = Math.min(score, 0.05);
  if (score > 0.1 && fileName !== undefined && /\.(ws|wsd|wst|doc)$/i.test(fileName)) score += 0.05;
  return Math.max(0, Math.min(0.95, score));
}
