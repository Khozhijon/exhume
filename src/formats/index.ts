// Every format module, in registration order. Add a module here to register it.
import type { FormatModule } from '../core/types.js';
import { macpaint } from './macpaint/index.js';
import { pcx } from './pcx/index.js';
import { ilbm } from './ilbm/index.js';

export const allFormats: FormatModule[] = [macpaint, pcx, ilbm];
