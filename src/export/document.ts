// Document export: Markdown, standalone HTML, plain text. Pure.
import type { DocumentBlock, DocumentPayload, TextRun } from '../core/types.js';

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function runText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('');
}

/**
 * Plain text: each paragraph is the concatenation of its run texts; blocks are joined by a blank line.
 * A page break is an empty block, so it shows as a longer run of newlines. Header and footer are not
 * included (they are not part of the flow of paragraphs).
 */
export function toPlainText(doc: DocumentPayload): string {
  return doc.blocks.map((b) => (b.type === 'paragraph' ? runText(b.runs) : '')).join('\n\n');
}

// ---- Markdown ----

function mdEscape(text: string): string {
  let s = text.replace(/[\\`*_[\]<>~|]/g, '\\$&');
  s = s.replace(/^( {0,3})(#|>|[-+=]\s|\d+[.)]\s|\d+[.)]$)/gm, (_m, sp: string, tok: string) => `${sp}\\${tok}`);
  s = s.replace(/^( {0,3})([-+=])$/gm, '$1\\$2');
  return s;
}

function wrapRun(run: TextRun): string {
  if (run.text === '') return '';
  const lead = /^\s*/.exec(run.text)?.[0] ?? '';
  const trail = lead.length === run.text.length ? '' : (/\s*$/.exec(run.text)?.[0] ?? '');
  const core = run.text.slice(lead.length, run.text.length - trail.length);
  const fmt = (t: string) => t.replace(/\r\n|\r|\n/g, '  \n');
  if (core === '') return fmt(mdEscape(run.text));
  let s = fmt(mdEscape(core));
  if (run.sup) s = `<sup>${s}</sup>`;
  if (run.sub) s = `<sub>${s}</sub>`;
  if (run.underline) s = `<u>${s}</u>`;
  if (run.strike) s = `~~${s}~~`;
  if (run.italic) s = `_${s}_`;
  if (run.bold) s = `**${s}**`;
  return fmt(mdEscape(lead)) + s + fmt(mdEscape(trail));
}

export function toMarkdown(doc: DocumentPayload): string {
  const out: string[] = [];
  if (doc.header) out.push(`<header>${htmlEscape(doc.header)}</header>`);
  for (const b of doc.blocks) {
    out.push(b.type === 'pageBreak' ? '---' : b.runs.map(wrapRun).join(''));
  }
  if (doc.footer) out.push(`<footer>${htmlEscape(doc.footer)}</footer>`);
  return out.length ? out.join('\n\n') + '\n' : '';
}

// ---- HTML ----

function htmlRun(run: TextRun): string {
  if (run.text === '') return '';
  let s = htmlEscape(run.text).replace(/\r\n|\r|\n/g, '<br>');
  if (run.sub) s = `<sub>${s}</sub>`;
  if (run.sup) s = `<sup>${s}</sup>`;
  if (run.strike) s = `<s>${s}</s>`;
  if (run.underline) s = `<u>${s}</u>`;
  if (run.italic) s = `<em>${s}</em>`;
  if (run.bold) s = `<strong>${s}</strong>`;
  return s;
}

function htmlBlock(b: DocumentBlock): string {
  return b.type === 'pageBreak' ? '<hr class="page-break">' : `<p>${b.runs.map(htmlRun).join('')}</p>`;
}

export function toHtml(doc: DocumentPayload, title = 'Exhumed document'): string {
  const body = [
    ...(doc.header ? [`<header>${htmlEscape(doc.header)}</header>`] : []),
    ...doc.blocks.map(htmlBlock),
    ...(doc.footer ? [`<footer>${htmlEscape(doc.footer)}</footer>`] : []),
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(title)}</title>
<style>body{font-family:Georgia,serif;max-width:42em;margin:2em auto;padding:0 1em;line-height:1.5}hr.page-break{margin:2em 0}header,footer{color:#555;font-size:.9em}</style>
</head>
<body>
${body.join('\n')}
</body>
</html>
`;
}
