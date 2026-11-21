// Shared property-test harness: the four properties every format must have (steering: formats.md,
// design.md "Correctness Properties" 1-4). A format's *.prop.test.ts supplies an arbitrary for valid
// payload models and calls formatProperties(); the rigor is the same for every format.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allInBounds, coverage } from './annotations.js';
import { ExhumeError } from './types.js';
import type { FormatModule, Specimen, SpecimenPayload } from './types.js';

export interface FormatPropertyOptions<M extends SpecimenPayload> {
  /** Arbitrary for valid models: everything it generates must survive encode -> decode unchanged. */
  model: fc.Arbitrary<M>;
  /** Runs for the model-based properties (models can be large). Default 40. */
  runs?: number;
  /** Runs for the arbitrary-bytes property. Default 300. */
  fuzzRuns?: number;
  /** Extra byte arbitraries for P2, e.g. a valid header followed by noise. */
  hostile?: fc.Arbitrary<Uint8Array>[];
}

function decodeOrExhumeError(format: FormatModule, bytes: Uint8Array): Specimen | null {
  try {
    return format.decode(bytes);
  } catch (e) {
    if (e instanceof ExhumeError) return null;
    throw e; // any other error class is a property violation
  }
}

/** Register P1-P4 for a format inside the current test file. */
export function formatProperties<M extends SpecimenPayload>(format: FormatModule, opts: FormatPropertyOptions<M>): void {
  const runs = opts.runs ?? 40;
  const encode = format.encode;
  if (!encode) throw new Error(`${format.id} has no encode(): P1, P3 and P4 need it`);

  describe(`${format.id}: properties every format must have`, () => {
    it('P1 round trip: decode(encode(m)).payload deep-equals m', () => {
      fc.assert(
        fc.property(opts.model, (m) => {
          const bytes = encode(m);
          const specimen = format.decode(bytes);
          expect(specimen.payload).toEqual(m);
          expect(format.detect(bytes)).toBeGreaterThanOrEqual(0.5);
        }),
        { numRuns: runs },
      );
    });

    it('P2 total: arbitrary bytes give a Specimen or ExhumeError, detect stays in [0,1]', () => {
      const noise = fc.uint8Array({ maxLength: 2048 });
      // valid files with a few bytes overwritten reach much deeper into the decoder than pure noise
      const mutated = fc
        .tuple(opts.model, fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), { minLength: 1, maxLength: 8 }))
        .map(([m, edits]) => {
          const bytes = encode(m).slice();
          for (const [at, v] of edits) if (bytes.length) bytes[at % bytes.length] = v;
          return bytes;
        });
      const check = (bytes: Uint8Array, name?: string): void => {
        const confidence = format.detect(bytes, name);
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
        const specimen = decodeOrExhumeError(format, bytes);
        if (specimen) expect(allInBounds(specimen.annotations, bytes.length)).toBe(true);
      };
      fc.assert(
        fc.property(fc.oneof(noise, ...(opts.hostile ?? [])), fc.option(fc.string(), { nil: undefined }), check),
        { numRuns: opts.fuzzRuns ?? 300 },
      );
      fc.assert(fc.property(mutated, (b) => check(b)), { numRuns: runs * 2 });
    });

    it('P3 annotations are honest: in bounds, and they tile every byte of an encoded file exactly once', () => {
      fc.assert(
        fc.property(opts.model, (m) => {
          const bytes = encode(m);
          const specimen = format.decode(bytes);
          expect(allInBounds(specimen.annotations, bytes.length)).toBe(true);
          const report = coverage(specimen.annotations, bytes.length);
          expect({ gaps: report.gaps, overlaps: report.overlaps }).toEqual({ gaps: [], overlaps: [] });
        }),
        { numRuns: runs },
      );
    });

    it('P4 truncation is survivable: any prefix decodes or throws ExhumeError; a cut specimen carries a warning', () => {
      fc.assert(
        fc.property(opts.model, fc.double({ min: 0, max: 1, noNaN: true }), (m, cut) => {
          const bytes = encode(m);
          const k = Math.min(bytes.length - 1, Math.floor(bytes.length * cut));
          if (k < 0) return;
          const specimen = decodeOrExhumeError(format, bytes.slice(0, k));
          if (specimen) {
            expect(specimen.warnings.length).toBeGreaterThan(0);
            expect(allInBounds(specimen.annotations, k)).toBe(true);
          }
        }),
        { numRuns: runs * 2 },
      );
    });
  });
}
