import { describe, it, expect } from 'vitest';
import { toMarkdown, toHtml, toPlainText } from './document.js';
import type { DocumentPayload } from '../core/types.js';

const doc: DocumentPayload = {
  kind: 'document',
  header: 'Top <1>',
  footer: 'Page 1',
  blocks: [
    { type: 'paragraph', runs: [{ text: 'Plain ' }, { text: 'bold', bold: true }, { text: ' ' }, { text: 'it', italic: true }, { text: ' ' }, { text: 'un', underline: true }, { text: ' ' }, { text: 'st', strike: true }] },
    { type: 'pageBreak' },
    { type: 'paragraph', runs: [{ text: 'H2', sub: true }, { text: 'O & x', sup: true }] },
  ],
};

describe('toPlainText', () => {
  it('joins paragraphs with blank lines and turns page breaks into extra newlines', () => {
    expect(toPlainText(doc)).toBe('Plain bold it un st\n\n\n\nH2O & x');
  });
  it('handles empty documents', () => {
    expect(toPlainText({ kind: 'document', blocks: [] })).toBe('');
  });
});

describe('toMarkdown', () => {
  it('writes inline formatting, page breaks, header and footer', () => {
    expect(toMarkdown(doc)).toBe(
      '<header>Top &lt;1&gt;</header>\n\n' +
        'Plain **bold** _it_ <u>un</u> ~~st~~\n\n---\n\n' +
        '<sub>H2</sub><sup>O & x</sup>\n\n<footer>Page 1</footer>\n',
    );
  });
  it('escapes characters that would change meaning', () => {
    const md = toMarkdown({ kind: 'document', blocks: [
      { type: 'paragraph', runs: [{ text: '# not a heading *star* _under_ `tick` [l](u) <b>' }] },
      { type: 'paragraph', runs: [{ text: '1. no list\n- no bullet' }] },
    ] });
    expect(md).toBe('\\# not a heading \\*star\\* \\_under\\_ \\`tick\\` \\[l\\](u) \\<b\\>\n\n\\1. no list  \n\\- no bullet\n');
  });
  it('keeps edge whitespace outside the markers and combines styles', () => {
    expect(toMarkdown({ kind: 'document', blocks: [{ type: 'paragraph', runs: [{ text: ' hi ', bold: true, italic: true }] }] })).toBe(' **_hi_** \n');
  });
  it('is empty for an empty document', () => {
    expect(toMarkdown({ kind: 'document', blocks: [] })).toBe('');
  });
});

describe('toHtml', () => {
  const html = toHtml(doc, 'A & B');
  it('is a complete standalone document with escaped title', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>A &amp; B</title>');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
  it('uses semantic tags, page break hr, header and footer', () => {
    expect(html).toContain('<header>Top &lt;1&gt;</header>');
    expect(html).toContain('<p>Plain <strong>bold</strong> <em>it</em> <u>un</u> <s>st</s></p>');
    expect(html).toContain('<hr class="page-break">');
    expect(html).toContain('<p><sub>H2</sub><sup>O &amp; x</sup></p>');
    expect(html).toContain('<footer>Page 1</footer>');
  });
  it('turns newlines into br and never emits raw markup from text', () => {
    const h = toHtml({ kind: 'document', blocks: [{ type: 'paragraph', runs: [{ text: '<script>\nx' }] }] });
    expect(h).toContain('<p>&lt;script&gt;<br>x</p>');
    expect(h).not.toContain('<script>');
  });
});
