// WordStar 3.x / 4 decoder. Layout: docs/formats/wordstar.md. There is no header: the file is a
// sequence of lines, each ended by a hard return (0x0D 0x0A) or a soft return (0x8D 0x0A), padded with ^Z.
import { MAX_FILE_SIZE, assertLimit } from '../../core/limits.js';
import { ByteReader } from '../../core/reader.js';
import { ExhumeError } from '../../core/types.js';
import type { DocumentBlock, Specimen, TextRun, Warning } from '../../core/types.js';
import { FLAGS, RECORD_SIZE } from './model.js';

const TOGGLES = new Map<number, number>([[0x02, 0], [0x04, 0], [0x13, 1], [0x19, 2], [0x18, 3], [0x14, 4], [0x16, 5]]);
const LINES_PER_CHUNK = 1000;

interface Line {
  start: number;
  end: number;
  label: string;
  value: string;
  /** terminator span, when the line has one */
  term?: { start: number; label: string };
  seqs: Array<[number, number]>;
  dot: boolean;
}

const printable = (b: number): boolean => (b & 0x7f) >= 0x20 && (b & 0x7f) < 0x7f;

function textOf(bytes: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i++) if (printable(bytes[i]!)) s += String.fromCharCode(bytes[i]! & 0x7f);
  return s;
}

function maskRun(text: string, mask: number): TextRun {
  const run: TextRun = { text };
  FLAGS.forEach((f, i) => {
    if (mask & (1 << i)) run[f] = true;
  });
  return run;
}

export function decode(bytes: Uint8Array): Specimen {
  assertLimit(bytes.length, MAX_FILE_SIZE, 'file size');
  if (bytes.length === 0) throw new ExhumeError('empty file', 'wordstar');

  const r = new ByteReader(bytes);
  const buf = r.buffer_;
  const size = buf.length;
  const warnings: Warning[] = [];
  const blocks: DocumentBlock[] = [];
  const dotCommands: string[] = [];
  const lines: Line[] = [];
  let header: string | undefined;
  let footer: string | undefined;

  let runs: TextRun[] = [];
  let runMask = -1;
  let mask = 0;
  let last = '';
  let joinNext = false;
  let dropped = 0;
  let seqWarned = false;

  const emit = (ch: string): void => {
    joinNext = false;
    if (runs.length > 0 && runMask === mask) runs[runs.length - 1]!.text += ch;
    else {
      runs.push(maskRun(ch, mask));
      runMask = mask;
    }
    last = ch;
  };
  const flush = (force: boolean): void => {
    if (force || runs.length > 0) blocks.push({ type: 'paragraph', runs });
    runs = [];
    runMask = -1;
    last = '';
  };

  let pos = 0;
  let lineStart = 0;
  let atHard = true;
  let padStart = -1;
  let seqs: Array<[number, number]> = [];

  const closeLine = (end: number, term: Line['term']): void => {
    const n = lines.length + 1;
    const line: Line = { start: lineStart, end, label: `line ${n}`, value: textOf(buf, lineStart, term ? term.start : end).slice(0, 60), seqs, dot: false };
    if (term) line.term = term;
    lines.push(line);
    lineStart = end;
    seqs = [];
  };

  while (pos < size) {
    const b = buf[pos]!;
    if (b === 0x1a) {
      padStart = pos;
      break;
    }
    // ---- dot command line
    if (atHard && pos === lineStart && b === 0x2e) {
      let j = pos;
      let end = -1;
      while (j < size && buf[j] !== 0x1a) {
        if ((buf[j] === 0x0d || buf[j] === 0x8d) && buf[j + 1] === 0x0a) {
          end = j + 2;
          break;
        }
        j++;
      }
      const textEnd = j;
      const lineEnd = end >= 0 ? end : j;
      const text = textOf(buf, pos, textEnd).trimEnd();
      const m = /^\.([A-Za-z]*)/.exec(text);
      const cmd = (m?.[1] ?? '').toUpperCase();
      const rest = text.slice(1 + cmd.length).trim();
      if (text.startsWith('..') || cmd === 'IG') {
        /* comment: discarded */
      } else if (cmd === 'PA') blocks.push({ type: 'pageBreak' });
      else if (cmd === 'HE') {
        if (rest) header = rest;
      } else if (cmd === 'FO') {
        if (rest) footer = rest;
      } else dotCommands.push(text);
      lines.push({ start: pos, end: lineEnd, label: `dot command ${text.startsWith('..') ? '..' : cmd ? '.' + cmd : text.slice(0, 8)}`, value: text.slice(0, 60), seqs: [], dot: true });
      lineStart = lineEnd;
      pos = lineEnd;
      continue;
    }
    const next = buf[pos + 1];
    if (b === 0x0d && next === 0x0a) {
      flush(true);
      mask = 0;
      joinNext = false;
      closeLine(pos + 2, { start: pos, label: 'hard return' });
      pos += 2;
      atHard = true;
      continue;
    }
    if (b === 0x8d && next === 0x0a) {
      if (!joinNext) emit(' '); // the soft return stands for one space (none after an active soft hyphen)
      joinNext = false;
      closeLine(pos + 2, { start: pos, label: 'soft return' });
      pos += 2;
      atHard = false;
      continue;
    }
    atHard = false;
    if (b === 0x1d) {
      if (pos + 3 <= size) {
        const len = buf[pos + 1]! | (buf[pos + 2]! << 8);
        const close = pos + 3 + len;
        if (close < size && buf[close] === 0x1d) {
          seqs.push([pos, close + 1]);
          pos = close + 1;
          if (!seqWarned) {
            seqWarned = true;
            warnings.push({ message: 'WordStar 5.x formatting sequences were ignored', offset: seqs[seqs.length - 1]![0] });
          }
          continue;
        }
        if (close >= size) {
          seqs.push([pos, size]);
          warnings.push({ message: 'a WordStar 5.x formatting sequence is cut off by the end of the file', offset: pos });
          if (!seqWarned) {
            seqWarned = true;
            warnings.push({ message: 'WordStar 5.x formatting sequences were ignored', offset: pos });
          }
          pos = size;
          continue;
        }
      }
      dropped++;
      pos++;
      continue;
    }
    if (b === 0x8a) {
      pos++;
      continue;
    }
    if (b === 0xa0) {
      // justification padding: a space only when no real space follows and the text does not already end in one
      const nx = buf[pos + 1];
      if (last !== ' ' && nx !== 0x20 && nx !== 0xa0) emit(' ');
      pos++;
      continue;
    }
    const c = b & 0x7f;
    const flag = TOGGLES.get(c);
    if (flag !== undefined) {
      mask ^= 1 << flag;
    } else if (c === 0x08) {
      // overprint: drop the backspace and the character struck over
      pos++;
      if (pos < size && printable(buf[pos]!)) pos++;
      continue;
    } else if (c === 0x0f) emit(' ');
    else if (c === 0x1e) {
      /* inactive soft hyphen */
    } else if (c === 0x1f) joinNext = true;
    else if (c === 0x09) emit('\t');
    else if (c === 0x0c) {
      flush(false);
      blocks.push({ type: 'pageBreak' });
    } else if (c < 0x20 || c === 0x7f) dropped++;
    else emit(String.fromCharCode(c));
    pos++;
  }
  if (padStart < 0 && pos > lineStart) closeLine(pos, undefined);
  else if (padStart >= 0 && padStart > lineStart) closeLine(padStart, undefined);
  flush(false);

  if (dropped > 0) warnings.push({ message: `${dropped} unrecognised control bytes were dropped` });
  if (padStart < 0) warnings.push({ message: 'no ^Z end-of-file marker: the file looks cut short', offset: size });
  else if (size % RECORD_SIZE !== 0) warnings.push({ message: `file length ${size} is not a multiple of 128 bytes: the last record looks cut short`, offset: size });

  // ---- annotations: lines tile [0, padStart or size), padding takes the rest
  const emitLine = (ln: Line): void => {
    if (ln.dot) {
      r.seek(ln.start);
      r.mark(ln.label, ln.start, ln.end, JSON.stringify(ln.value));
      return;
    }
    r.seek(ln.start);
    r.group(ln.label, () => {
      let at = ln.start;
      const textEnd = ln.term ? ln.term.start : ln.end;
      const text = (to: number): void => {
        if (to > at) r.mark('text', at, to, at === ln.start ? JSON.stringify(ln.value) : undefined);
        at = to;
      };
      for (const [s, e] of ln.seqs) {
        text(s);
        r.mark('5.x sequence', s, e);
        at = e;
      }
      text(textEnd);
      if (ln.term) r.mark(ln.term.label, ln.term.start, ln.end);
    });
  };
  if (lines.length > 2 * LINES_PER_CHUNK) {
    for (let a = 0; a < lines.length; a += LINES_PER_CHUNK) {
      const chunk = lines.slice(a, a + LINES_PER_CHUNK);
      r.seek(chunk[0]!.start);
      r.group(`lines ${a + 1}..${a + chunk.length}`, () => chunk.forEach(emitLine));
    }
  } else lines.forEach(emitLine);
  if (padStart >= 0) {
    r.seek(padStart);
    r.mark('end-of-file padding', padStart, size, `${size - padStart} bytes`);
  }

  return {
    payload: { kind: 'document', blocks, ...(header !== undefined ? { header } : {}), ...(footer !== undefined ? { footer } : {}) },
    annotations: r.annotations(),
    warnings,
    meta: { blockCount: blocks.length, dotCommands },
  };
}
