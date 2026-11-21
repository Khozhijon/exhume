Implement task 3 of the spec in .kiro/specs/exhume-core/tasks.md, including every sub-task.
Sub-tasks marked optional with `*` (the property tests) are REQUIRED in this project: write them and make them pass.

Work economically: the task text and the design sections you need are inlined below, so do NOT
read requirements.md, design.md or tasks.md in full. Use grep on them only for a specific detail.
Read existing source files you depend on once (several in one step). Write each file in one go,
several files per step. No exploratory listing, no long narration. Check with ONE command:
`npm run -s typecheck && npx vitest run <folders you touched> 2>&1 | tail -40`. At most 3 fix rounds;
if something still fails after that, stop and say exactly what fails.

## The task (from tasks.md)
- [ ] 3. Code pages and PackBits
  - Create `src/core/codepage.ts` with 256-entry lookup tables for `cp437()`, `cp850()`, `cp1252()`, `macRoman()` and the shared `decodeBytes(bytes, decode)` helper
  - Create `src/core/packbits.ts` with `decodePack(src, maxOut): Uint8Array` (stops at maxOut bytes, throws `ExhumeError` on structural invalidity) and `encodePack(src, rowSize?): Uint8Array` (runs never cross row boundaries when `rowSize` is provided)
  - Create `src/core/codepage.test.ts` with example tests for representative byte values in each code page, including bytes ≥ 0x80
  - Create `src/core/packbits.test.ts` with example tests: literal run, repeat run, no-op byte, truncated stream, maxOut enforcement
  - [ ]* 3.1 Write property test for PackBits round-trip (Property P5)
    - **Property P5: PackBits round-trip** — `decodePack(encodePack(b), b.length)` deep-equals `b` for any `Uint8Array` up to 4096 bytes
    - **Validates: Requirements 2.4, 2.5, 4.6**
  - _Requirements: 2.3, 2.4, 4.4, 4.5, 5.6_


## Design excerpts (from design.md)
### PackBits / ByteRun1 (`src/core/packbits.ts`)

Shared by MacPaint and ILBM. The codec is identical in both formats.

```typescript
/**
 * Decode a PackBits / ByteRun1 stream.
 * Stops after emitting maxOut bytes; ignores trailing input.
 * Throws ExhumeError if the stream is structurally invalid (not merely truncated).
 */
export function decodePack(src: Uint8Array, maxOut: number): Uint8Array;

/**
 * Encode src with PackBits.
 * Canonical: compress row by row when rowSize is provided; otherwise treats src as one row.
 * Runs never cross row boundaries.
 */
export function encodePack(src: Uint8Array, rowSize?: number): Uint8Array;
```

Round-trip invariant: `decodePack(encodePack(b), b.length)` deep-equals `b` for any `Uint8Array b`.


### Code Pages (`src/core/codepage.ts`)

```typescript
/** Decode a single byte using the specified code page. Returns a one-character string. */
export function cp437(byte: number): string;
export function cp850(byte: number): string;
export function cp1252(byte: number): string;
export function macRoman(byte: number): string;

/** Decode a byte array to a JS string using the given decoder. */
export function decodeBytes(
  bytes: Uint8Array,
  decode: (b: number) => string,
): string;
```

Each function is a 256-entry lookup table. Bytes 0x00–0x7F map to their ASCII equivalents in all
tables (with the control-character exceptions mandated by each standard).

Usage by format:
- **dbf**: `cp437` by default; `cp850` or `cp1252` per language driver id; unknown driver → `cp437`
  with warning if any byte ≥ 0x80 appears.
- **wk1**: bytes < 0x80 as ASCII; bytes ≥ 0x80 as ISO 8859-1 with one warning.
- **macpaint**: not needed (bitmap only; pattern data is binary, not text).
- **wordstar**: strip bit 7 to get ASCII; `cp437` is not used.
- **pcx / ilbm**: not needed (binary pixel data).

---


### Property 5: PackBits round-trip

*For any* `Uint8Array` `b` of length up to 4096 bytes, encoding `b` with `encodePack` and then
decoding the result with `decodePack(output, b.length)` produces a byte array that deep-equals `b`.

**Validates: Requirements 2.4, 2.5, 4.6**



## Notes from the reviewer
Before starting task 3, fix these review findings in `src/core/reader.ts` (from docs/reviews/task-02.md)
and add a regression test for each in `src/core/reader.test.ts`:
1. `u32le` and `u32be` return negative numbers for values >= 0x80000000 because `b3 << 24` is a signed
   operation. Use `>>> 0` on the result. Tests: 0xFFFFFFFF and 0x80000000, both byte orders; the
   annotation value must show the unsigned number.
2. `nullString` must consume the NUL terminator only when it found one. With no terminator it stops at
   `maxLen` or at the end of the buffer and the offset must never exceed `size`. Tests: unterminated
   string at end of buffer; `maxLen` reached without NUL leaves the next byte unread.
3. `bytes(n)` and `skip(n)` must throw `ExhumeError` unless `n` is a non-negative integer.
Do not install any package: `fast-check` is already installed and is imported as `import fc from 'fast-check'`.

## Finish
When the check command passes, mark task 3 and its sub-tasks [x] in tasks.md and give a report of at most 12 lines.
