// Registry of format modules

import { ExhumeError } from './types.js';
import type { FormatModule, Specimen } from './types.js';

// Empty module list - will be populated by format modules
const modules: FormatModule[] = [];

export function register(module: FormatModule): void {
  modules.push(module);
}

export function detect(
  bytes: Uint8Array,
  fileName?: string,
): Array<{ module: FormatModule; confidence: number }> {
  const results: Array<{ module: FormatModule; confidence: number }> = [];
  for (const module of modules) {
    const confidence = module.detect(bytes, fileName);
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

export function dispatch(
  bytes: Uint8Array,
  fileName?: string,
): Specimen {
  const module = identify(bytes, fileName);
  if (!module) {
    throw new ExhumeError('unknown format');
  }
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

// Export current modules count for testing
export function getModuleCount(): number {
  return modules.length;
}
