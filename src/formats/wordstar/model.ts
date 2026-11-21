// WordStar model rules shared by encode(), the tests and the property-test arbitrary.
//
// A "valid model" is a DocumentPayload for which decode(encode(m)).payload deep-equals m:
//  - blocks: any mix of { type: "pageBreak" } (written as a ".PA" line) and paragraphs
//  - paragraph text (all runs joined) is printable ASCII 0x20..0x7E, with no leading, trailing or doubled
//    space, and does not start with "." (it would read as a dot command). A paragraph may be empty:
//    `runs: []` is written as a bare hard return. A paragraph with text always has at least one run.
//  - every run has non-empty text; a style flag is either absent or `true` (never `false`);
//    adjacent runs differ in at least one flag (otherwise decoding would merge them)
//  - header / footer: absent, or non-empty printable ASCII with no leading or trailing space
//    (written as ".HE text" / ".FO text" lines at the top of the file)
//  - no tabs, no control characters, no non-ASCII text
// Models used for the P1 property additionally contain at least one word of text, because only text
// carries the high-bit word marks that make a WordStar file recognisable by detect().
import type { DocumentPayload, TextRun } from '../../core/types.js';

export const FLAGS = ['bold', 'underline', 'italic', 'strike', 'sup', 'sub'] as const;
export type Flag = (typeof FLAGS)[number];
/** Toggle control byte (^B ^S ^Y ^X ^T ^V) for each flag, in the order the encoder writes them. */
export const TOGGLE_BYTES: Record<Flag, number> = { bold: 0x02, underline: 0x13, italic: 0x19, strike: 0x18, sup: 0x14, sub: 0x16 };
export const WRAP_COLUMN = 65;
export const RECORD_SIZE = 128;

const PRINTABLE = /^[\x20-\x7e]*$/;

export function maskOf(run: TextRun): number {
  let m = 0;
  FLAGS.forEach((f, i) => {
    if (run[f] === true) m |= 1 << i;
  });
  return m;
}

function validText(s: string): boolean {
  return PRINTABLE.test(s) && s === s.trim() && !s.includes('  ') && !s.startsWith('.');
}

function validLabel(s: string): boolean {
  return s.length > 0 && PRINTABLE.test(s) && s === s.trim();
}

/** null when `model` is a valid model (rules at the top of this file), else a reason. */
export function validateDocument(model: DocumentPayload): string | null {
  if (model.header !== undefined && !validLabel(model.header)) return 'header must be non-empty printable ASCII without edge spaces';
  if (model.footer !== undefined && !validLabel(model.footer)) return 'footer must be non-empty printable ASCII without edge spaces';
  for (const [i, b] of model.blocks.entries()) {
    if (b.type === 'pageBreak') continue;
    let prev = -1;
    let text = '';
    for (const run of b.runs) {
      if (run.text.length === 0) return `block ${i}: empty run`;
      for (const k of Object.keys(run)) {
        if (k !== 'text' && !(FLAGS as readonly string[]).includes(k)) return `block ${i}: unknown key ${k}`;
      }
      for (const f of FLAGS) if (run[f] !== undefined && run[f] !== true) return `block ${i}: ${f} must be true or absent`;
      const m = maskOf(run);
      if (m === prev) return `block ${i}: adjacent runs have the same style`;
      prev = m;
      text += run.text;
    }
    if (!validText(text)) return `block ${i}: paragraph text is not valid (printable ASCII, no edge/double spaces, no leading dot)`;
  }
  return null;
}
