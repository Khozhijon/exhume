import type { FormatModule } from '../../core/types.js';
import { decode } from './decode.js';
import { encode } from './encode.js';

export { decompileFormula } from './formula.js';
export { compileFormula } from './formula-parse.js';
export { translateToExcel } from './excel.js';
export { formatValue, serialToIso } from './format-byte.js';

/** BOF record: type 0x0000, length 2, version 0x0404 (1A), 0x0405 (Symphony) or 0x0406 (2.x), little-endian. */
function detect(bytes: Uint8Array, fileName?: string): number {
  if (bytes.length < 6) return 0;
  const bof = bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 2 && bytes[3] === 0;
  const version = bytes[5] === 4 && (bytes[4] === 4 || bytes[4] === 5 || bytes[4] === 6);
  if (!bof || !version) return 0;
  const ext = fileName ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
  return ext === '.wk1' || ext === '.wks' ? 0.95 : 0.9;
}

export const wk1: FormatModule = {
  id: 'wk1',
  name: 'Lotus 1-2-3',
  born: 1983,
  died: 1995,
  extensions: ['.wk1', '.wks'],
  kind: 'sheet',
  epitaph: 'The spreadsheet that put the PC on every desk, until Windows moved on.',
  detect,
  decode,
  encode,
};

export default wk1;
