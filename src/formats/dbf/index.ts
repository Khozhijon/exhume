import type { FormatModule } from '../../core/types.js';
import { decode } from './decode.js';
import { encode } from './encode.js';

const VERSIONS = new Set([0x03, 0x83, 0x04, 0x8b, 0x30, 0x31, 0xf5]);

function detect(bytes: Uint8Array, fileName?: string): number {
  const ext = fileName !== undefined && /\.dbf$/i.test(fileName) ? 0.15 : 0;
  if (bytes.length < 32) return ext > 0 ? 0.1 : 0;
  if (!VERSIONS.has(bytes[0]!)) return ext > 0 ? 0.1 : 0;
  let score = 0.6;
  const headerLength = bytes[8]! | (bytes[9]! << 8);
  if (headerLength >= 33 && (headerLength - 33) % 32 === 0) score = 0.8;
  return Math.min(1, score + ext);
}

export const dbf: FormatModule = {
  id: 'dbf',
  name: 'dBASE',
  born: 1980,
  died: 1995,
  extensions: ['.dbf'],
  kind: 'table',
  epitaph: 'Ashton-Tate kept the world\'s address books in fixed-width rows. The rows are still here.',
  detect,
  decode,
  encode,
};
