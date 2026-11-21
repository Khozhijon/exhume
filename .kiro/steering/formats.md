---
inclusion: fileMatch
fileMatchPattern: ["src/formats/**", "src/core/**", "mcp/**"]
---
# Writing a format module

1. **Read the notes first:** `docs/formats/<id>.md` holds the byte layout we rely on and its sources.
   If the notes and your memory disagree, follow the notes and say so.
2. **detect()** is cheap and total: check magic numbers and structural invariants, return a confidence.
   File extension alone is worth at most 0.3.
3. **decode()** uses `ByteReader`. Each read names its field: `r.u16le("recordLength")`. Group fields
   with `r.group("header", () => ...)` so the Autopsy shows a tree.
4. **Damage is normal.** Truncated data, bad lengths and unknown record types become `warnings` and the
   decoder keeps going with what it has. Only an unusable file (not this format at all, or zero content
   recoverable) throws `ExhumeError`.
5. **Hard limits** stop decompression bombs: refuse dimensions or counts above the limits in
   `src/core/limits.ts` with an `ExhumeError`, never allocate from an unchecked length.
6. **encode()** writes canonical files. `decode(encode(m))` must equal `m` for every valid model `m`.
7. **Text encodings:** legacy text is bytes. Decode through the code page tables in
   `src/core/codepage.ts` (CP437 for DOS formats, MacRoman for Mac formats); never `TextDecoder("utf-8")`.

# Properties every format must have (fast-check)
- **P1 round trip:** `decode(encode(m)).payload` deep-equals `m` for arbitrary valid models.
- **P2 total:** for arbitrary bytes, `detect` returns a number in [0,1] and `decode` either returns a
  Specimen or throws `ExhumeError`; it never throws anything else and never hangs.
- **P3 annotations are honest:** every annotation lies inside the file, and for files from `encode`
  the top-level annotations cover every byte exactly once (no gaps, no overlaps).
- **P4 truncation is survivable:** decoding any prefix of a valid file never throws a non-ExhumeError,
  and if it returns a Specimen that was cut short it carries at least one warning.

# How to test a format (shared harness)
`src/core/testing.ts` exports `formatProperties(module, { model, runs?, fuzzRuns?, hostile? })`. Call it
from `src/formats/<id>/<id>.prop.test.ts` with a fast-check arbitrary for **valid payload models**; it
registers P1-P4 with the same rigor for every format (round trip, noise and mutated-file fuzzing,
exact annotation tiling, truncation). Format-specific properties (codecs, formulas) go in the same file.
Keep model arbitraries small enough to run fast but able to reach the edge cases (empty, maximum
field widths, every record/field/colour type).

# Core API cheat sheet
- `ByteReader(bytes)`: `u8 u16le u16be u32le u32be i8 i16le i32le f64le` `(label)`, `bytes(n,label)`,
  `text(n,label,codePage)`, `nullString(label,maxLen?)`, `skip(n,label)`, `group(label,fn)`,
  `mark(label,start,end,value?)` for spans consumed by a codec, `peek(at?)`, `seek(offset)`,
  `offset size remaining`, `annotations()`. Reads past the end throw `ExhumeError`: check `remaining`
  first when truncation should be a warning instead.
- `ByteWriter`: `writeU8 writeU16le writeU16be writeU32le writeU32be writeI16le writeI32le writeF64le
  writeBytes`, `length`, `toUint8Array()`.
- `packbits.ts`: `encodePack(src,rowSize?)`, `decodePack(src,maxOut)` (strict), `unpackBits(src,maxOut,from?)`
  (lenient: `{out, produced, consumed, complete}`).
- `codepage.ts`: `cp437 cp850 cp1252 macRoman latin1`, `decodeBytes`, `encodeString`, `isEncodable`.
- `limits.ts`: `MAX_*` constants and `assertLimit(value, limit, name)`.
- `annotations.ts`: `coverage`, `allInBounds`, `locate`, `countNodes`.
