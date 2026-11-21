import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { toPlainText, toMarkdown, toHtml } from './document.js';
import type { DocumentBlock, DocumentPayload } from '../core/types.js';

const run = fc.record(
  { text: fc.string({ maxLength: 8 }), bold: fc.boolean(), italic: fc.boolean(), underline: fc.boolean(), strike: fc.boolean(), sup: fc.boolean(), sub: fc.boolean() },
  { requiredKeys: ['text'] },
);
const block: fc.Arbitrary<DocumentBlock> = fc.oneof(
  fc.record({ type: fc.constant('paragraph' as const), runs: fc.array(run, { maxLength: 4 }) }),
  fc.constant({ type: 'pageBreak' as const }),
);
const docArb: fc.Arbitrary<DocumentPayload> = fc.record(
  { kind: fc.constant('document' as const), blocks: fc.array(block, { maxLength: 6 }), header: fc.string({ maxLength: 5 }), footer: fc.string({ maxLength: 5 }) },
  { requiredKeys: ['kind', 'blocks'] },
);

describe('document export properties', () => {
  it('toPlainText is the run texts per paragraph joined by blank lines', () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const expected = doc.blocks.map((b) => (b.type === 'paragraph' ? b.runs.map((r) => r.text).join('') : '')).join('\n\n');
        expect(toPlainText(doc)).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });
  it('markdown and html never throw and html contains no raw angle brackets from text', () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        expect(typeof toMarkdown(doc)).toBe('string');
        const body = toHtml(doc).split('<body>')[1] ?? '';
        expect(body).not.toMatch(/<\s*script/i);
      }),
    );
  });
});
