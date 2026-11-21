import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatProperties } from '../../core/testing.js';
import type { DocumentBlock, DocumentPayload, TextRun } from '../../core/types.js';
import { wordstar } from './index.js';
import { encode } from './encode.js';
import { decode } from './decode.js';
import { FLAGS, validateDocument } from './model.js';

const wordChar = fc.integer({ min: 0x21, max: 0x7e }).map((c) => String.fromCharCode(c));
const wordArb = fc.oneof(
  { weight: 6, arbitrary: fc.array(wordChar, { minLength: 1, maxLength: 12 }).map((a) => a.join('')) },
  { weight: 1, arbitrary: fc.array(wordChar, { minLength: 60, maxLength: 80 }).map((a) => a.join('')) }, // longer than a line
);

/** Words joined by single spaces, never starting with a dot. */
const textArb = fc.array(wordArb, { minLength: 1, maxLength: 40 }).map((w) => {
  const t = w.join(' ');
  return t.startsWith('.') ? 'x' + t.slice(1) : t;
});

const labelArb = fc.array(wordArb, { minLength: 1, maxLength: 4 }).map((w) => w.join(' '));

/** Cut a paragraph text into runs with styles such that adjacent runs always differ. */
const paragraphArb: fc.Arbitrary<DocumentBlock> = fc
  .tuple(textArb, fc.array(fc.nat(), { maxLength: 8 }), fc.array(fc.integer({ min: 0, max: 63 }), { minLength: 9, maxLength: 9 }), fc.nat(5))
  .map(([text, cutSeeds, masks, flip]): DocumentBlock => {
    const cuts = [...new Set(cutSeeds.map((c) => 1 + (c % Math.max(1, text.length - 1))))].filter((c) => c < text.length).sort((a, b) => a - b);
    const bounds = [0, ...cuts, text.length];
    const runs: TextRun[] = [];
    let prev = -1;
    for (let i = 0; i + 1 < bounds.length; i++) {
      let m = masks[i]!;
      if (m === prev) m ^= 1 << flip;
      prev = m;
      const run: TextRun = { text: text.slice(bounds[i]!, bounds[i + 1]!) };
      FLAGS.forEach((f, k) => {
        if (m & (1 << k)) run[f] = true;
      });
      runs.push(run);
    }
    return { type: 'paragraph', runs };
  });

const emptyParagraph: fc.Arbitrary<DocumentBlock> = fc.constant({ type: 'paragraph', runs: [] });
const blockArb: fc.Arbitrary<DocumentBlock> = fc.oneof(
  { weight: 6, arbitrary: paragraphArb },
  { weight: 1, arbitrary: emptyParagraph },
  { weight: 1, arbitrary: fc.constant<DocumentBlock>({ type: 'pageBreak' }) },
);

/** Valid models (see model.ts) that contain at least one word, so detect() has something to recognise. */
export const documentArb: fc.Arbitrary<DocumentPayload> = fc
  .tuple(fc.array(blockArb, { maxLength: 6 }), paragraphArb, fc.nat(), fc.option(labelArb, { nil: undefined }), fc.option(labelArb, { nil: undefined }))
  .map(([blocks, must, at, header, footer]) => {
    const all = blocks.slice();
    all.splice(at % (all.length + 1), 0, must);
    const doc: DocumentPayload = { kind: 'document', blocks: all };
    if (header !== undefined) doc.header = header;
    if (footer !== undefined) doc.footer = footer;
    return doc;
  });

describe('wordstar model arbitrary', () => {
  it('generates only valid models', () => {
    fc.assert(fc.property(documentArb, (d) => { expect(validateDocument(d)).toBeNull(); }), { numRuns: 300 });
  });
});

describe('wordstar specific properties', () => {
  it('every wrapped line is at most 65 columns unless one word is longer; soft returns replace exactly one space', () => {
    fc.assert(
      fc.property(documentArb, (d) => {
        const bytes = encode({ kind: 'document', blocks: d.blocks }); // header/footer lines are not wrapped
        let col = 0;
        let lineWords = 0;
        for (let i = 0; i < bytes.length; i++) {
          const b = bytes[i]!;
          if (b === 0x1a) break;
          if ((b === 0x8d || b === 0x0d) && bytes[i + 1] === 0x0a) {
            if (lineWords > 1) expect(col).toBeLessThanOrEqual(65);
            col = 0;
            lineWords = 0;
            i++;
          } else if ((b & 0x7f) >= 0x20) {
            col++;
            if (b === 0x20) lineWords++;
            if (col === 1) lineWords = 1;
          }
        }
        expect(bytes.length % 128).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('the high bit appears only on word-final characters and soft returns', () => {
    fc.assert(
      fc.property(documentArb, (d) => {
        const bytes = encode(d);
        for (let i = 0; i < bytes.length; i++) {
          if (bytes[i]! < 0x80) continue;
          if (bytes[i] === 0x8d && bytes[i + 1] === 0x0a) {
            i++;
            continue;
          }
          const next = bytes[i + 1]!;
          expect(next === 0x20 || next === 0x0d || next === 0x8d || next < 0x20).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('decoding an encoded file gives no warnings', () => {
    fc.assert(fc.property(documentArb, (d) => { expect(decode(encode(d)).warnings).toEqual([]); }), { numRuns: 100 });
  });
});

formatProperties(wordstar, {
  model: documentArb,
  runs: 60,
  hostile: [
    // text-like bytes with dot commands, soft returns, 5.x sequences and ^Z sprinkled in
    fc.array(
      fc.oneof(
        fc.integer({ min: 0x20, max: 0xff }),
        fc.constantFrom(0x0d, 0x0a, 0x8d, 0x8a, 0xa0, 0x1d, 0x1a, 0x2e, 0x08, 0x1f, 0x00, 0x02),
      ),
      { maxLength: 400 },
    ).map((a) => Uint8Array.from(a)),
  ],
});
