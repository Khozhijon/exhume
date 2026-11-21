import type { FormatModule } from '../../core/types.js';
import { decode, formKind } from './decode.js';
import { encode } from './encode.js';

export const ilbm: FormatModule = {
  id: 'ilbm',
  name: 'IFF ILBM',
  born: 1985,
  died: 1996,
  extensions: ['.iff', '.ilbm', '.lbm'],
  kind: 'image',
  epitaph: 'Electronic Arts’ picture form for the Amiga: bit planes, ByteRun1 rows and the hold-and-modify trick of Deluxe Paint.',
  detect(bytes: Uint8Array): number {
    if (formKind(bytes)) return 0.95;
    if (bytes.length >= 4 && bytes[0] === 0x46 && bytes[1] === 0x4f && bytes[2] === 0x52 && bytes[3] === 0x4d) return 0.1;
    return 0;
  },
  decode,
  encode,
};
