import { describe, expect, it } from 'vitest';
import { allInBounds, coverage } from '../../core/annotations.js';
import { ExhumeError } from '../../core/types.js';
import type { DocumentPayload } from '../../core/types.js';
import { wordstar } from './index.js';
import { decode } from './decode.js';
import { encode } from './encode.js';

const CRLF = [0x0d, 0x0a];
const SOFT = [0x8d, 0x0a];
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
/** Text as WordStar stores it: bit 7 set on the last character of every word. */
const hw = (s: string): number[] => [...s].map((c, i) => c.charCodeAt(0) | (c !== ' ' && (s[i + 1] === ' ' || i + 1 === s.length) ? 0x80 : 0));
const padded = (b: number[]): Uint8Array => Uint8Array.from([...b, ...new Array<number>(128 - (b.length % 128)).fill(0x1a)]);
const doc = (b: number[]): ReturnType<typeof decode> => decode(padded(b));
const text = (s: ReturnType<typeof decode>): string[] =>
  s.payload.kind === 'document' ? s.payload.blocks.map((b) => (b.type === 'pageBreak' ? '<PB>' : b.runs.map((r) => r.text).join('|'))) : [];

describe('wordstar decode', () => {
  it('hand-built WordStar 3.3 style file: dot commands, justified soft lines, soft spaces, ^Z padding', () => {
    const bytes = padded([
      ...ascii('.PL 66'), ...CRLF,
      ...ascii('.MT 3'), ...CRLF,
      ...ascii('.HE Dear Sirs'), ...CRLF,
      ...ascii('..a comment'), ...CRLF,
      ...hw('Dear Sirs,'), ...CRLF,
      ...hw('We write to'), 0xa0, 0x20, ...hw('tell you that the'), 0x8a, ...SOFT,
      ...hw('invoice is overdue.'), ...CRLF,
      ...CRLF,
      ...ascii('.PA'), ...CRLF,
      ...hw('Yours'), ...CRLF,
    ]);
    const s = decode(bytes);
    expect(text(s)).toEqual(['Dear Sirs,', 'We write to tell you that the invoice is overdue.', '', '<PB>', 'Yours']);
    expect(s.payload).toMatchObject({ header: 'Dear Sirs' });
    expect(s.meta.dotCommands).toEqual(['.PL 66', '.MT 3']);
    expect(s.meta.blockCount).toBe(5);
    expect(s.warnings).toEqual([]);
    expect(wordstar.detect(bytes)).toBeGreaterThanOrEqual(0.5);
    expect(coverage(s.annotations, bytes.length).exact).toBe(true);
    const labels = s.annotations.map((a) => a.label);
    expect(labels.slice(0, 5)).toEqual(['dot command .PL', 'dot command .MT', 'dot command .HE', 'dot command ..', 'line 5']);
    expect(labels[labels.length - 1]).toBe('end-of-file padding');
    const soft = s.annotations.find((a) => a.label === 'line 6')!;
    expect(soft.children?.map((c) => c.label)).toEqual(['text', 'soft return']);
  });

  it('toggles: ^B bold, ^S underline, ^Y italic, ^D double strike (bold), ^X strike, ^T sup, ^V sub', () => {
    const cases: Array<[number, string]> = [[0x02, 'bold'], [0x13, 'underline'], [0x19, 'italic'], [0x04, 'bold'], [0x18, 'strike'], [0x14, 'sup'], [0x16, 'sub']];
    for (const [byte, flag] of cases) {
      const s = doc([...ascii('a '), byte, ...hw('b c'), byte, ...ascii(' d'), ...CRLF]);
      expect(s.payload.kind === 'document' && s.payload.blocks[0]).toEqual({
        type: 'paragraph',
        runs: [{ text: 'a ' }, { text: 'b c', [flag]: true }, { text: ' d' }],
      });
    }
  });

  it('a toggle left open is cleared by the hard return', () => {
    const s = doc([0x02, ...ascii('bold'), ...CRLF, ...ascii('plain'), ...CRLF]);
    expect(s.payload.kind === 'document' && s.payload.blocks).toEqual([
      { type: 'paragraph', runs: [{ text: 'bold', bold: true }] },
      { type: 'paragraph', runs: [{ text: 'plain' }] },
    ]);
  });

  it('combined toggles produce combined flags', () => {
    const s = doc([0x02, 0x13, ...ascii('x'), 0x02, ...ascii('y'), 0x13, ...ascii('z'), ...CRLF]);
    expect(s.payload.kind === 'document' && s.payload.blocks[0]).toEqual({
      type: 'paragraph', runs: [{ text: 'x', bold: true, underline: true }, { text: 'y', underline: true }, { text: 'z' }],
    });
  });

  it('soft CR joins lines with one space; a soft hyphen at the line end joins the word', () => {
    expect(text(doc([...hw('one two'), ...SOFT, ...hw('three'), ...CRLF]))).toEqual(['one two three']);
    expect(text(doc([...ascii('hy'), 0x1f, ...SOFT, ...hw('phen'), ...CRLF]))).toEqual(['hyphen']);
    expect(text(doc([...ascii('co'), 0x1e, ...hw('op'), ...CRLF]))).toEqual(['coop']);
  });

  it('a dot at the start of a soft-wrapped line is text, not a command', () => {
    const s = doc([...hw('end'), ...SOFT, ...ascii('.PA tail'), ...CRLF]);
    expect(text(s)).toEqual(['end .PA tail']);
    expect(s.meta.dotCommands).toEqual([]);
  });

  it('.PA and ^L give pageBreak blocks; .HE / .FO set header and footer; .. and .IG are discarded; others are kept', () => {
    const s = doc([
      ...ascii('.HE  My header  '), ...CRLF, ...ascii('.FO Page # '), ...CRLF, ...ascii('.IG ignore me'), ...CRLF,
      ...ascii('.OP'), ...CRLF, ...ascii('.PN 5'), ...CRLF, ...ascii('.pa'), ...CRLF,
      ...hw('before'), 0x0c, ...hw('after'), ...CRLF,
    ]);
    expect(s.payload).toEqual({
      kind: 'document', header: 'My header', footer: 'Page #',
      blocks: [{ type: 'pageBreak' }, { type: 'paragraph', runs: [{ text: 'before' }] }, { type: 'pageBreak' }, { type: 'paragraph', runs: [{ text: 'after' }] }],
    });
    expect(s.meta.dotCommands).toEqual(['.OP', '.PN 5']);
  });

  it('control bytes: ^O is a space, tab stays, overprint drops the ^H and the struck character, 0xA0 is one space', () => {
    expect(text(doc([...ascii('a'), 0x0f, ...ascii('b'), 0x09, ...ascii('c'), ...CRLF]))).toEqual(['a b\tc']);
    expect(text(doc([...ascii('x'), 0x08, ...ascii('/yz'), ...CRLF]))).toEqual(['xyz']);
    expect(text(doc([...ascii('a'), 0xa0, 0xa0, 0x20, ...ascii('b'), ...CRLF]))).toEqual(['a b']);
    expect(text(doc([...ascii('a'), 0x8a, ...ascii('b'), ...CRLF]))).toEqual(['ab']);
  });

  it('unknown control bytes are dropped with one warning', () => {
    const s = doc([...ascii('a'), 0x01, 0x05, 0x07, ...ascii('b'), ...CRLF]);
    expect(text(s)).toEqual(['ab']);
    expect(s.warnings.filter((w) => /control bytes/.test(w.message))).toHaveLength(1);
    expect(s.warnings[0]?.message).toMatch(/^3 /);
  });

  it('WordStar 5 symmetrical sequences are skipped with exactly one warning', () => {
    const seq = (payload: number[]): number[] => [0x1d, payload.length & 255, payload.length >> 8, ...payload, 0x1d];
    const s = doc([
      ...seq([0x01, 0x02, 0x03]), ...hw('Five'), ...seq([0x0d, 0x0a, 0x1a]), ...ascii(' point'), ...CRLF, // payload even holds CR LF and ^Z
      ...seq([]), ...hw('zero'), ...CRLF,
    ]);
    expect(text(s)).toEqual(['Five point', 'zero']);
    expect(s.warnings.filter((w) => /5\.x formatting/.test(w.message))).toHaveLength(1);
    expect(s.warnings).toHaveLength(1);
    const line1 = s.annotations.find((a) => a.label === 'line 1')!;
    expect(line1.children?.filter((c) => c.label === '5.x sequence')).toHaveLength(2);
    expect(coverage(s.annotations, s.annotations[s.annotations.length - 1]!.end).exact).toBe(true);
  });

  it('a cut-off 5.x sequence warns; a stray 0x1D is a control byte', () => {
    const cut = decode(Uint8Array.from([...hw('hi'), 0x20, 0x1d, 0x10, 0x00, 1, 2]));
    expect(cut.warnings.some((w) => /cut off/.test(w.message))).toBe(true);
    expect(text(cut)).toEqual(['hi ']);
    const stray = doc([0x1d, 0x00, 0x00, ...ascii('x'), ...CRLF]);
    expect(text(stray)).toEqual(['x']);
  });

  it('^Z stops decoding; everything after it is padding', () => {
    const bytes = Uint8Array.from([...hw('keep'), ...CRLF, 0x1a, ...hw('ghost'), ...CRLF, ...new Array<number>(100).fill(0x1a)]);
    const s = decode(bytes);
    expect(text(s)).toEqual(['keep']);
    const pad = s.annotations[s.annotations.length - 1]!;
    expect(pad).toMatchObject({ label: 'end-of-file padding', start: 6, end: bytes.length });
  });

  it('missing ^Z or a length that is not a multiple of 128 is a truncation warning', () => {
    const bare = decode(Uint8Array.from([...hw('no padding'), ...CRLF]));
    expect(text(bare)).toEqual(['no padding']);
    expect(bare.warnings.some((w) => /\^Z/.test(w.message))).toBe(true);
    const short = decode(Uint8Array.from([...hw('short'), ...CRLF, 0x1a, 0x1a]));
    expect(short.warnings.some((w) => /multiple of 128/.test(w.message))).toBe(true);
    const mid = decode(Uint8Array.from(hw('cut mid-li')));
    expect(text(mid)).toEqual(['cut mid-li']);
    expect(mid.warnings.length).toBeGreaterThan(0);
  });

  it('empty input throws ExhumeError; NUL bytes outside 5.x sequences are dropped controls', () => {
    expect(() => decode(new Uint8Array(0))).toThrow(ExhumeError);
    const s = decode(Uint8Array.of(0x41, 0x00, 0x42, 0x1a));
    expect(text(s)).toEqual(['AB']);
    expect(s.warnings.some((w) => /control bytes/.test(w.message))).toBe(true);
  });

  it('thousands of lines are grouped so the top level stays small and tiles the file', () => {
    const body: number[] = [];
    for (let i = 0; i < 2500; i++) body.push(...hw(`line ${i}`), ...CRLF);
    const bytes = padded(body);
    const s = decode(bytes);
    expect(s.annotations.length).toBeLessThan(5);
    expect(coverage(s.annotations, bytes.length).exact).toBe(true);
    expect(allInBounds(s.annotations, bytes.length)).toBe(true);
  });
});

describe('wordstar detect', () => {
  it('real WordStar text scores >= 0.5, soft returns and dot commands raise it, the cap is 0.95', () => {
    const body = [...hw('The quick brown fox jumps'), ...SOFT, ...hw('over the lazy dog.'), ...CRLF];
    expect(wordstar.detect(padded(body))).toBeGreaterThanOrEqual(0.5);
    const rich = padded([...ascii('.PA'), ...CRLF, ...ascii('.HE x'), ...CRLF, ...ascii('.OP'), ...CRLF, ...body]);
    expect(wordstar.detect(rich, 'x.ws')).toBeGreaterThan(wordstar.detect(padded(body)));
    expect(wordstar.detect(rich, 'x.ws')).toBeLessThanOrEqual(0.95);
  });

  it('plain 7-bit text scores <= 0.1, also with a .txt-like name; accented Latin-1 text is not WordStar', () => {
    const plain = ascii('Just some ordinary text.\r\nSecond line, nothing special.\r\n');
    expect(wordstar.detect(Uint8Array.from(plain))).toBeLessThanOrEqual(0.1);
    expect(wordstar.detect(Uint8Array.from(plain), 'x.txt')).toBeLessThanOrEqual(0.1);
    const latin = Uint8Array.from([...ascii('Un caf'), 0xe9, ...ascii(' tr'), 0xe8, ...ascii('s bon, na'), 0xef, ...ascii('ve et d'), 0xe9, ...ascii('licieux.\r\n')]);
    expect(wordstar.detect(latin)).toBeLessThan(0.5);
  });

  it('binary data scores 0', () => {
    expect(wordstar.detect(new Uint8Array(0))).toBe(0);
    expect(wordstar.detect(Uint8Array.of(0x1a, 0x1a))).toBe(0);
    expect(wordstar.detect(Uint8Array.from([...hw('looks fine'), 0x00, ...CRLF]))).toBe(0);
    expect(wordstar.detect(Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 0x1f || 1))).toBe(0);
  });
});

describe('wordstar encode', () => {
  const run = (text: string, extra: object = {}): DocumentPayload['blocks'][number] => ({ type: 'paragraph', runs: [{ text, ...extra }] });

  it('writes word-final high bits, a hard return and ^Z padding to 128 bytes', () => {
    const b = encode({ kind: 'document', blocks: [run('Hi you')] });
    expect([...b.slice(0, 9)]).toEqual([0x48, 0xe9, 0x20, 0x79, 0x6f, 0xf5, 0x0d, 0x0a, 0x1a]);
    expect(b.length).toBe(128);
    expect(b.slice(8).every((x) => x === 0x1a)).toBe(true);
  });

  it('pads a whole extra record when the content is already a multiple of 128', () => {
    // 62 lines of "ab" + CRLF = 62 * 4 bytes = 248... build exactly 128: 32 lines of 2 chars + CRLF
    const blocks = Array.from({ length: 32 }, () => run('ab'));
    const b = encode({ kind: 'document', blocks });
    expect(b.length).toBe(256);
    expect(b[127]).toBe(0x0a);
    expect(b[128]).toBe(0x1a);
  });

  it('wraps at column 65 with soft returns, writes toggles and dot lines', () => {
    const words = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
    const model: DocumentPayload = {
      kind: 'document', header: 'Top', footer: 'Bottom',
      blocks: [{ type: 'pageBreak' }, { type: 'paragraph', runs: [{ text: words, bold: true }, { text: ' end', italic: true }] }],
    };
    const b = encode(model);
    const asText = [...b].map((x) => (x === 0x0a ? '\n' : x === 0x0d ? '' : String.fromCharCode(x & 0x7f)));
    expect(asText.join('').startsWith('.HE Top\n.FO Bottom\n.PA\n')).toBe(true);
    let softs = 0;
    let col = 0;
    let maxCol = 0;
    const body = b.slice('.HE Top\r\n.FO Bottom\r\n.PA\r\n'.length);
    for (let i = 0; i < body.length - 1; i++) {
      if (body[i] === 0x8d && body[i + 1] === 0x0a) {
        softs++;
        maxCol = Math.max(maxCol, col);
        col = 0;
      } else if (body[i]! >= 0x20) col++;
    }
    expect(softs).toBeGreaterThanOrEqual(2);
    expect(maxCol).toBeLessThanOrEqual(65);
    expect(b.includes(0x02)).toBe(true);
    expect(b.includes(0x19)).toBe(true);
    const s = decode(b);
    expect(s.payload).toEqual(model);
    expect(s.warnings).toEqual([]);
    expect(coverage(s.annotations, b.length).exact).toBe(true);
  });

  it('round-trips the empty document and empty paragraphs', () => {
    for (const m of [
      { kind: 'document', blocks: [] },
      { kind: 'document', blocks: [{ type: 'paragraph', runs: [] }, { type: 'pageBreak' }, { type: 'paragraph', runs: [] }] },
    ] as DocumentPayload[]) {
      const s = decode(encode(m));
      expect(s.payload).toEqual(m);
      expect(s.warnings).toEqual([]);
    }
  });

  it('a space that changes style at a wrap point survives', () => {
    const long = 'x'.repeat(64);
    const model: DocumentPayload = {
      kind: 'document',
      blocks: [{ type: 'paragraph', runs: [{ text: long }, { text: ' ', bold: true }, { text: 'tail' }] }],
    };
    expect(decode(encode(model)).payload).toEqual(model);
  });

  it('rejects models outside the valid set', () => {
    const bad = (m: DocumentPayload): void => expect(() => encode(m)).toThrow(ExhumeError);
    bad({ kind: 'document', blocks: [run(' lead')] });
    bad({ kind: 'document', blocks: [run('trail ')] });
    bad({ kind: 'document', blocks: [run('two  spaces')] });
    bad({ kind: 'document', blocks: [run('.dot')] });
    bad({ kind: 'document', blocks: [run('tab\there')] });
    bad({ kind: 'document', blocks: [run('é')] });
    bad({ kind: 'document', blocks: [{ type: 'paragraph', runs: [{ text: 'a' }, { text: 'b' }] }] });
    bad({ kind: 'document', blocks: [{ type: 'paragraph', runs: [{ text: '' }] }] });
    bad({ kind: 'document', blocks: [run('a', { bold: false })] });
    bad({ kind: 'document', blocks: [], header: '' });
  });
});
