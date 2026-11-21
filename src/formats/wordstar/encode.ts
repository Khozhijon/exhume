// WordStar 4 writer. See model.ts for what a valid model is.
//
// Body: each paragraph is wrapped greedily at column 65 on single spaces. The space at a wrap point is not
// written; a soft carriage return (0x8D 0x0A) stands for exactly that one space, and the decoder puts the
// space back. The last character of every word has bit 7 set. Style changes are toggle bytes written just
// before the first character of the new style (before the soft CR when the space itself changes style);
// open toggles are closed before the hard return (0x0D 0x0A). Page breaks are ".PA" lines, header/footer
// are ".HE" / ".FO" lines at the top. The file is padded with ^Z (0x1A) to a multiple of 128 bytes with at
// least one ^Z, so a file that lacks the padding can be recognised as cut short.
import { ByteWriter } from '../../core/writer.js';
import { ExhumeError } from '../../core/types.js';
import type { SpecimenPayload, TextRun } from '../../core/types.js';
import { FLAGS, RECORD_SIZE, TOGGLE_BYTES, WRAP_COLUMN, maskOf, validateDocument } from './model.js';

function writeLine(w: ByteWriter, text: string): void {
  for (let i = 0; i < text.length; i++) w.writeU8(text.charCodeAt(i));
  w.writeU8(0x0d);
  w.writeU8(0x0a);
}

function toggles(w: ByteWriter, from: number, to: number): void {
  const diff = from ^ to;
  FLAGS.forEach((f, i) => {
    if (diff & (1 << i)) w.writeU8(TOGGLE_BYTES[f]);
  });
}

/** Indexes of the spaces at which the paragraph text is wrapped. */
function wrapPoints(text: string): Set<number> {
  const breaks = new Set<number>();
  let lineLen = 0;
  let i = 0;
  let first = true;
  while (i < text.length) {
    let j = text.indexOf(' ', i);
    if (j < 0) j = text.length;
    const len = j - i;
    if (first) lineLen = len;
    else if (lineLen + 1 + len > WRAP_COLUMN) {
      breaks.add(i - 1);
      lineLen = len;
    } else lineLen += 1 + len;
    first = false;
    i = j + 1;
  }
  return breaks;
}

function writeParagraph(w: ByteWriter, runs: TextRun[]): void {
  const text = runs.map((r) => r.text).join('');
  const masks: number[] = [];
  for (const r of runs) for (let k = 0; k < r.text.length; k++) masks.push(maskOf(r));
  const breaks = wrapPoints(text);
  let state = 0;
  for (let i = 0; i < text.length; i++) {
    toggles(w, state, masks[i]!);
    state = masks[i]!;
    if (text[i] === ' ') {
      if (breaks.has(i)) {
        w.writeU8(0x8d);
        w.writeU8(0x0a);
      } else w.writeU8(0x20);
    } else {
      const wordFinal = i + 1 === text.length || text[i + 1] === ' ';
      w.writeU8(text.charCodeAt(i) | (wordFinal ? 0x80 : 0));
    }
  }
  toggles(w, state, 0);
  w.writeU8(0x0d);
  w.writeU8(0x0a);
}

export function encode(model: SpecimenPayload): Uint8Array {
  if (model.kind !== 'document') throw new ExhumeError('wordstar: encode needs a document payload', 'wordstar');
  const problem = validateDocument(model);
  if (problem) throw new ExhumeError(`wordstar: invalid model: ${problem}`, 'wordstar');
  const w = new ByteWriter();
  if (model.header !== undefined) writeLine(w, `.HE ${model.header}`);
  if (model.footer !== undefined) writeLine(w, `.FO ${model.footer}`);
  for (const b of model.blocks) {
    if (b.type === 'pageBreak') writeLine(w, '.PA');
    else writeParagraph(w, b.runs);
  }
  const pad = RECORD_SIZE - (w.length % RECORD_SIZE);
  for (let i = 0; i < pad; i++) w.writeU8(0x1a);
  return w.toUint8Array().slice();
}
