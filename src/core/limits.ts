// Hard limits for decoders

import { ExhumeError } from './types.js';

export const MAX_IMAGE_WIDTH = 32_768;
export const MAX_IMAGE_HEIGHT = 32_768;
export const MAX_IMAGE_PIXELS = 50_000_000;
export const MAX_RECORD_COUNT = 1_000_000;
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_DECOMPRESSED_SIZE = 200 * 1024 * 1024; // 200 MB

/** Throws ExhumeError if value > limit. */
export function assertLimit(value: number, limit: number, name: string): void {
  if (value > limit) {
    throw new ExhumeError(`${name} ${value} exceeds limit ${limit}`);
  }
}
