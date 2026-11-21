import type { FormatModule } from '../../core/types.js';
import { decode } from './decode.js';
import { encode } from './encode.js';

function detect(bytes: Uint8Array, fileName?: string): number {
  const ext = fileName !== undefined && /\.pcx$/i.test(fileName);
  if (bytes.length < 1 || bytes[0] !== 0x0a) return ext ? 0.2 : 0;
  if (bytes.length < 128) return 0.7;
  const version = bytes[1]!;
  const encoding = bytes[2]!;
  const bpp = bytes[3]!;
  const planes = bytes[65]!;
  const le = (o: number): number => bytes[o]! | (bytes[o + 1]! << 8);
  const ok =
    [0, 2, 3, 4, 5].includes(version) &&
    (encoding === 0 || encoding === 1) &&
    [1, 2, 4, 8].includes(bpp) &&
    [1, 3, 4].includes(planes) &&
    le(8) >= le(4) &&
    le(10) >= le(6);
  return ok ? (ext ? 0.9 : 0.85) : 0.7;
}

export const pcx: FormatModule = {
  id: 'pcx',
  name: 'PC Paintbrush',
  born: 1985,
  died: 2000,
  extensions: ['.pcx'],
  kind: 'image',
  epitaph: 'ZSoft taught DOS to paint in 16 colours, then 256, and every scanline was run-length coded.',
  detect,
  decode,
  encode,
};
