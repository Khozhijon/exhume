import type { FormatModule } from '../../core/types.js';
import { decode, hasMacBinary, HEADER_BYTES } from './decode.js';
import { encode } from './encode.js';

const EXT = /\.(mac|pntg|pnt)$/i;

function detect(bytes: Uint8Array, fileName?: string): number {
  const ext = fileName !== undefined && EXT.test(fileName) ? 0.2 : 0;
  if (hasMacBinary(bytes)) return 0.95;
  if (bytes.length >= HEADER_BYTES && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && (bytes[3] === 0 || bytes[3] === 2)) {
    return 0.6 + (ext > 0 ? 0.1 : 0);
  }
  return ext;
}

export const macpaint: FormatModule = {
  id: 'macpaint',
  name: 'MacPaint',
  born: 1984,
  died: 1988,
  extensions: ['.mac', '.pntg', '.pnt'],
  kind: 'image',
  epitaph: 'The first bitmap many people ever drew: 576 by 720 dots, black or white, packed eight to a byte.',
  detect,
  decode,
  encode,
};
