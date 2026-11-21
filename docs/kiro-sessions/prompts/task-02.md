Implement task 2 of the spec in .kiro/specs/exhume-core/tasks.md, including every sub-task.
Sub-tasks marked optional with `*` (the property tests) are REQUIRED in this project: write them and make them pass.

Work economically: the task text and the design sections you need are inlined below, so do NOT
read requirements.md, design.md or tasks.md in full. Use grep on them only for a specific detail.
Read existing source files you depend on once. Write each file in one go. No exploratory listing.

## The task (from tasks.md)
- [ ] 2. ByteReader and ByteWriter
  - Create `src/core/reader.ts` implementing `ByteReader` with all methods: `u8`, `u16le`, `u16be`, `u32le`, `u32be`, `i8`, `i16le`, `i32le`, `f64le`, `bytes(n, label)`, `nullString(label, maxLen?)`, `group(label, fn)`, `skip(n, label)`, `seek(offset)`, `annotations()`; expose `offset`, `size`, `remaining` as readonly properties; every read automatically records an `Annotation` span
  - Create `src/core/writer.ts` implementing `ByteWriter` with: `writeU8`, `writeU16le`, `writeU16be`, `writeU32le`, `writeU32be`, `writeI16le`, `writeI32le`, `writeF64le`, `writeBytes`, `toUint8Array`, readonly `length`
  - Create `src/core/reader.test.ts` with example tests covering all read methods, group nesting, seek, skip, and bounds-checking behaviour
  - Create `src/core/writer.test.ts` with example tests covering all write methods and round-trip with DataView reads
  - [ ]* 2.1 Write property test for ByteReader annotations (Property P3)
    - **Property P3: Annotations are honest** — for a fully-written then fully-read file, top-level annotations cover every byte exactly once with no gaps and no overlaps
    - **Validates: Requirements 9.3, 9.6**
  - _Requirements: 9.1, 9.2, 9.3_


## Design excerpts (from design.md)
### ByteReader Interface (`src/core/reader.ts`)

```typescript
export interface ByteReader {
  /** Current read offset (bytes from start). */
  readonly offset: number;
  /** Total file size in bytes. */
  readonly size: number;
  /** Bytes remaining from current offset. */
  readonly remaining: number;

  u8(label: string): number;
  u16le(label: string): number;
  u16be(label: string): number;
  u32le(label: string): number;
  u32be(label: string): number;
  i8(label: string): number;
  i16le(label: string): number;
  i32le(label: string): number;
  f64le(label: string): number;
  /** Read n bytes and return a view (no copy). */
  bytes(n: number, label: string): Uint8Array;
  /** Read a NUL-terminated string, consuming up to maxLen bytes. */
  nullString(label: string, maxLen?: number): string;
  /** Group reads inside fn under a parent annotation. */
  group<T>(label: string, fn: () => T): T;
  /** Advance offset by n, recording an annotation. */
  skip(n: number, label: string): void;
  /** Seek to absolute offset (does not record an annotation). */
  seek(offset: number): void;
  /** Return collected annotations. */
  annotations(): Annotation[];
}
```


### ByteWriter Interface (`src/core/writer.ts`)

```typescript
export interface ByteWriter {
  writeU8(value: number): void;
  writeU16le(value: number): void;
  writeU16be(value: number): void;
  writeU32le(value: number): void;
  writeU32be(value: number): void;
  writeI16le(value: number): void;
  writeI32le(value: number): void;
  writeF64le(value: number): void;
  writeBytes(src: Uint8Array): void;
  /** Current write position. */
  readonly length: number;
  /** Return the written bytes as a new Uint8Array. */
  toUint8Array(): Uint8Array;
}
```

---


### Property 3: Annotation honesty (P3) — all formats

*For any* file produced by a format's `encode` function, the top-level annotations of the resulting
decoded `Specimen` cover every byte index from 0 to `fileSize − 1` exactly once — no index appears
in two annotations, and no index is absent from all annotations.

**Validates: Requirements 9.3, 9.6**



## Finish
Run `npm run typecheck` and `npx vitest run <the folders you touched>`. Fix failures in the code.
Then mark task 2 and its sub-tasks [x] in tasks.md and give the short report your instructions describe.
