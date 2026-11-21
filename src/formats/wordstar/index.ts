import type { FormatModule } from '../../core/types.js';
import { decode } from './decode.js';
import { detectWordStar } from './detect.js';
import { encode } from './encode.js';

export const wordstar: FormatModule = {
  id: 'wordstar',
  name: 'WordStar',
  born: 1978,
  died: 1992,
  extensions: ['.ws', '.wsd', '.ws4', '.wst'],
  kind: 'document',
  epitaph: 'Every word ended in a flipped bit. A generation of novels began here.',
  detect: detectWordStar,
  decode,
  encode,
};
