// Registry of format modules

import { ExhumeError } from './types.js';
import { MAX_FILE_SIZE } from './limits.js';
import type { FormatModule, Specimen } from './types.js';

import { allFormats } from '../formats/index.js';

/** Every supported format, in registration order (the order breaks exact ties). */
export const modules: readonly FormatModule[] = allFormats;

export function detect(
  bytes: Uint8Array,
  fileName?: string,
): Array<{ module: FormatModule; confidence: number }> {
  const results: Array<{ module: FormatModule; confidence: number }> = [];
  for (const module of modules) {
    let confidence = 0;
    try {
      confidence = module.detect(bytes, fileName);
    } catch {
      confidence = 0; // detect must not throw; if one does, it simply does not match
    }
    if (!(confidence >= 0 && confidence <= 1)) confidence = 0;
    if (confidence > 0) {
      results.push({ module, confidence });
    }
  }
  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

export function identify(
  bytes: Uint8Array,
  fileName?: string,
): FormatModule | null {
  const matches = detect(bytes, fileName);
  let best = matches[0];
  if (!best) return null;
  const top = best.confidence;

  // Tiebreaking: prefer module whose extension matches filename
  if (fileName && matches.length > 1) {
    const dot = fileName.lastIndexOf('.');
    const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
    const tied = matches.filter((m) => m.confidence === top);
    for (const m of tied) {
      if (m.module.extensions.includes(ext)) {
        best = m;
        break;
      }
    }
  }

  if (best.confidence >= 0.5) {
    return best.module;
  }
  return null;
}

export interface Exhumed {
  module: FormatModule;
  specimen: Specimen;
}

/** Identify and decode. Throws only ExhumeError. */
export function exhume(bytes: Uint8Array, fileName?: string): Exhumed {
  if (bytes.length > MAX_FILE_SIZE) {
    throw new ExhumeError(`file size ${bytes.length} exceeds limit ${MAX_FILE_SIZE}`);
  }
  const module = identify(bytes, fileName);
  if (!module) {
    throw new ExhumeError('unrecognised format: no decoder is confident about these bytes');
  }
  return { module, specimen: decodeWith(module, bytes) };
}

/** Decode with a known module, converting any stray error into ExhumeError. */
export function decodeWith(module: FormatModule, bytes: Uint8Array): Specimen {
  try {
    return module.decode(bytes);
  } catch (err) {
    if (err instanceof ExhumeError) {
      throw err;
    }
    throw new ExhumeError(
      `decode failed: ${err instanceof Error ? err.message : String(err)}`,
      module.id,
    );
  }
}

