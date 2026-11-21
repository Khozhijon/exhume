// ByteReader property tests (fast-check)

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ByteReader } from './reader.js';
import type { Annotation } from './types.js';

/**
 * Property P3: Annotations are honest
 * For a fully-written then fully-read file, top-level annotations cover every byte
 * exactly once with no gaps and no overlaps.
 */
describe('ByteReader property tests', () => {
  describe('P3: Annotations are honest', () => {
    it('covers every byte exactly once when reading all fields', () => {
      const prop = fc.property(
        fc.integer({ min: 0, max: 1024 }),
        (size) => {
          const data = new Uint8Array(size);
          for (let i = 0; i < size; i++) {
            data[i] = Math.floor(Math.random() * 256);
          }

          const reader = new ByteReader(data);
          let bytesRead = 0;

          // Read everything in a way that creates annotations
          while (bytesRead < size) {
            const remaining = size - bytesRead;

            // Read some bytes and create an annotation for each read
            if (remaining >= 4) {
              reader.u32le('chunk');
              bytesRead += 4;
            } else if (remaining >= 2) {
              reader.u16le('chunk');
              bytesRead += 2;
            } else {
              reader.u8('byte');
              bytesRead += 1;
            }
          }

          // Verify annotations
          const anns = reader.annotations();
          const covered = new Array(size).fill(false);

          for (const ann of anns) {
            // Every annotation must be within bounds
            expect(ann.start).toBeGreaterThanOrEqual(0);
            expect(ann.end).toBeLessThanOrEqual(size);
            expect(ann.start).toBeLessThanOrEqual(ann.end);

            // Mark covered bytes
            for (let i = ann.start; i < ann.end; i++) {
              covered[i] = true;
            }
          }

          // All bytes must be covered
          for (let i = 0; i < size; i++) {
            expect(covered[i], `Byte ${i} is not covered`).toBe(true);
          }

          // No overlaps: each byte should be covered exactly once
          for (let i = 0; i < size; i++) {
            let count = 0;
            for (const ann of anns) {
              if (i >= ann.start && i < ann.end) {
                count++;
              }
            }
            expect(count, `Byte ${i} is covered ${count} times`).toBe(1);
          }
          return true;
        },
      );
      fc.assert(prop);
    });

    it('handles group annotations correctly', () => {
      const prop = fc.property(
        fc.integer({ min: 8, max: 24 }), // At least 8 bytes (4 for header + 4 for body)
        (size) => {
          // Ensure size is a multiple of 4
          const alignedSize = Math.floor(size / 4) * 4;
          const data = new Uint8Array(alignedSize);
          for (let i = 0; i < alignedSize; i++) {
            data[i] = Math.floor(Math.random() * 256);
          }

          const reader = new ByteReader(data);

          // Read with nested groups
          reader.group('header', () => {
            reader.u16le('magic');
            reader.u16le('length');
          });

          reader.group('body', () => {
            reader.u32le('data');
          });

          // Read remaining bytes
          let remaining = alignedSize - 8; // 4 (header) + 4 (body)
          while (remaining > 0) {
            if (remaining >= 4) {
              reader.u32le('footer');
              remaining -= 4;
            } else if (remaining >= 2) {
              reader.u16le('footer');
              remaining -= 2;
            } else {
              reader.u8('footer');
              remaining -= 1;
            }
          }

          // Verify structure - should have multiple top-level annotations now
          const anns = reader.annotations();
          expect(anns.length).toBeGreaterThanOrEqual(2);
          expect(anns[0]!.label).toBe('header');
          expect(anns[1]!.label).toBe('body');
          expect(anns[0]!.children!).toHaveLength(2);
          expect(anns[1]!.children!).toHaveLength(1);

          // Verify coverage: all bytes should be covered
          const covered = new Array(alignedSize).fill(false);
          function markCovered(ann: Annotation): void {
            for (let i = ann.start; i < ann.end; i++) {
              covered[i] = true;
            }
            if (ann.children) {
              for (const child of ann.children) {
                markCovered(child);
              }
            }
          }
          for (const ann of anns) {
            markCovered(ann);
          }

          for (let i = 0; i < alignedSize; i++) {
            expect(covered[i]!).toBe(true);
          }
          return true;
        },
      );
      fc.assert(prop);
    });

    it('annotations are valid for empty buffer', () => {
      const reader = new ByteReader(new Uint8Array(0));
      const anns = reader.annotations();
      expect(anns).toEqual([]);
    });
  });
});
