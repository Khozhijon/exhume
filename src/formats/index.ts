// Every format module, in registration order. Add a module here to register it.
import type { FormatModule } from '../core/types.js';
import { macpaint } from './macpaint/index.js';
import { pcx } from './pcx/index.js';
import { ilbm } from './ilbm/index.js';
import { wk1 } from './wk1/index.js';
import { dbf } from './dbf/index.js';
import { wordstar } from './wordstar/index.js';

export const allFormats: FormatModule[] = [macpaint, pcx, ilbm, wk1, dbf, wordstar];
