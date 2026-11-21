# Implementation Plan: Exhume Core

## Overview

Build Exhume from the ground up: scaffold and tooling first, then core infrastructure (ByteReader/Writer, codecs, registry), then one format module per task, then UI views, then export, then MCP tools, and finally offline/accessibility/deploy. Each task leaves the app in a runnable state.

## Tasks

- [ ] 1. Project scaffold and tooling
  - Create `package.json` with Vite + React 18 + TypeScript strict config and all allowed runtime and dev deps (`react`, `react-dom`, `fflate`, `vite`, `typescript`, `vitest`, `fast-check`, `@vitejs/plugin-react`, `@modelcontextprotocol/sdk`, `zod`)
  - Add `tsconfig.json` with `strict: true`, `moduleResolution: bundler`, `target: ES2022`
  - Configure `vite.config.ts` with `@vitejs/plugin-react` and `base: process.env.VITE_BASE ?? '/'`
  - Configure `vitest.config.ts` (or inline in vite config) for `*.test.ts` and `*.prop.test.ts`
  - Add npm scripts: `dev`, `build`, `typecheck`, `test`, `samples`
  - Create `src/core/types.ts` with `ExhumeError`, `Annotation`, `Warning`, `Specimen`, `FormatModule`, and all payload union types (`ImagePayload`, `SheetPayload`, `TablePayload`, `DocumentPayload`, `SpecimenPayload`, `SpecimenMeta`)
  - Create `src/core/limits.ts` with all six constants (`MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT`, `MAX_IMAGE_PIXELS`, `MAX_RECORD_COUNT`, `MAX_FILE_SIZE`, `MAX_DECOMPRESSED_SIZE`) and `assertLimit` helper
  - Create `src/core/registry.ts` with empty module list and stub implementations of `detect()`, `identify()`, `dispatch()`
  - Create `index.html`, `src/main.tsx`, `src/App.tsx` rendering an "Exhume" heading with no crash
  - _Requirements: 1.1, 8.1, 8.3_

- [ ] 2. ByteReader and ByteWriter
  - Create `src/core/reader.ts` implementing `ByteReader` with all methods: `u8`, `u16le`, `u16be`, `u32le`, `u32be`, `i8`, `i16le`, `i32le`, `f64le`, `bytes(n, label)`, `nullString(label, maxLen?)`, `group(label, fn)`, `skip(n, label)`, `seek(offset)`, `annotations()`; expose `offset`, `size`, `remaining` as readonly properties; every read automatically records an `Annotation` span
  - Create `src/core/writer.ts` implementing `ByteWriter` with: `writeU8`, `writeU16le`, `writeU16be`, `writeU32le`, `writeU32be`, `writeI16le`, `writeI32le`, `writeF64le`, `writeBytes`, `toUint8Array`, readonly `length`
  - Create `src/core/reader.test.ts` with example tests covering all read methods, group nesting, seek, skip, and bounds-checking behaviour
  - Create `src/core/writer.test.ts` with example tests covering all write methods and round-trip with DataView reads
  - [ ]* 2.1 Write property test for ByteReader annotations (Property P3)
    - **Property P3: Annotations are honest** — for a fully-written then fully-read file, top-level annotations cover every byte exactly once with no gaps and no overlaps
    - **Validates: Requirements 9.3, 9.6**
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] 3. Code pages and PackBits
  - Create `src/core/codepage.ts` with 256-entry lookup tables for `cp437()`, `cp850()`, `cp1252()`, `macRoman()` and the shared `decodeBytes(bytes, decode)` helper
  - Create `src/core/packbits.ts` with `decodePack(src, maxOut): Uint8Array` (stops at maxOut bytes, throws `ExhumeError` on structural invalidity) and `encodePack(src, rowSize?): Uint8Array` (runs never cross row boundaries when `rowSize` is provided)
  - Create `src/core/codepage.test.ts` with example tests for representative byte values in each code page, including bytes ≥ 0x80
  - Create `src/core/packbits.test.ts` with example tests: literal run, repeat run, no-op byte, truncated stream, maxOut enforcement
  - [ ]* 3.1 Write property test for PackBits round-trip (Property P5)
    - **Property P5: PackBits round-trip** — `decodePack(encodePack(b), b.length)` deep-equals `b` for any `Uint8Array` up to 4096 bytes
    - **Validates: Requirements 2.4, 2.5, 4.6**
  - _Requirements: 2.3, 2.4, 4.4, 4.5, 5.6_

- [ ] 4. MCP server skeleton — identify and hexdump
  - Create `mcp/server.mjs` as a Node.js stdio MCP server using `@modelcontextprotocol/sdk`
  - Implement the `identify` tool: read file with `fs.readFileSync`, convert to `Uint8Array`, call `registry.detect()`, return matches sorted by confidence descending
  - Implement the `hexdump` tool: read file, return classic hex+ASCII lines (16 bytes/row, format `0000: 4D 5A 90 00  MZ..`)
  - Import from `dist/core/registry.js`; wrap all tool handlers so `ExhumeError` returns `{ error: message }` instead of crashing
  - Create `mcp/server.test.mjs` with example tests for `hexdump` output format (offset formatting, ASCII column, short last row)
  - _Requirements: 23.1, 23.2, 23.3_

- [ ] 5. MacPaint format module
  - Create `src/formats/macpaint/decode.ts`: detect and skip 128-byte MacBinary wrapper (byte 0 = 0x00, byte 1 in 1–63, bytes 65–68 = `PNTG`) annotated as `"macBinaryHeader"`; read 512-byte document header in a `group("documentHeader")` (version u32, warn if not 0 or 2, 38 × 8-byte patterns, skip padding to offset 512); decode 720 PackBits-compressed rows in a `group("bitmap")` calling `decodePack`; white-fill with warning if input exhausted before 51 840 bytes; annotate remaining bytes as `"slack"`
  - Create `src/formats/macpaint/encode.ts`: write 512-byte header (version = 2, 38 patterns from model or zeroed), PackBits-compress each row individually; no MacBinary wrapper
  - Create `src/formats/macpaint/index.ts` exporting the `FormatModule`: `detect` returns 0.95 for MacBinary+PNTG magic, 0.6 for raw version 0 or 2 at offset 0, near 0 otherwise
  - Create `src/formats/macpaint/macpaint.test.ts` with example tests: minimal valid fixture decodes correctly; truncated file fills white + warning; MacBinary wrapper skipped; wrong version adds warning
  - [ ]* 5.1 Write property tests P1–P4 for MacPaint
    - **Property P1: Round-trip** — `decode(encode(m)).payload` deep-equals `m` for arbitrary valid `ImagePayload` models (576×720, 1 bpp)
    - **Property P2: Decoder totality** — `detect` returns [0,1] and `decode` returns Specimen or throws `ExhumeError` for arbitrary bytes
    - **Property P3: Annotation honesty** — top-level annotations cover every byte exactly once for files from `encode`
    - **Property P4: Truncation survivability** — decoding any prefix of a valid encoded file never throws non-`ExhumeError`; short Specimens carry a warning
    - **Validates: Requirements 2.1–2.5, 8.1–8.4, 9.1–9.3**
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_

- [ ] 6. PCX format module
  - Create `src/formats/pcx/decode.ts`: throw `ExhumeError("not a PCX file")` if byte 0 ≠ 0x0A; read 128-byte header in `group("header")` (manufacturer, version, encoding, bitsPerPixel, nPlanes, bytesPerLine, xMin/yMin/xMax/yMax, EGA palette 16 RGB triples, paletteInfo); apply `assertLimit` on width/height/pixels; reject unsupported layout with `ExhumeError("unsupported PCX layout")`; for 2 bpp add CGA warning and synthesise fixed palette; for encoding=0 add uncompressed warning; for encoding=1 RLE-decode entire pixel data tolerating runs crossing scanline boundaries; for 8 bpp × 1 plane with version=5 seek to `fileLength − 769` and read VGA palette or use greyscale ramp + warning; compose pixels from planes per layout
  - Create `src/formats/pcx/encode.ts`: write canonical 128-byte header; RLE-encode scanlines (literals ≥ 0xC0 written as run of 1); write VGA palette for 8 bpp × 1 plane
  - Create `src/formats/pcx/index.ts` exporting `FormatModule`: `detect` returns 0.7 for byte 0 = 0x0A; boost to 0.85 for valid version + encoding + bitsPerPixel combo
  - Create `src/formats/pcx/pcx.test.ts` with example tests: RLE run crossing scanline boundary; VGA palette detection; missing palette uses greyscale + warning; unsupported layout throws; uncompressed file decodes + warning
  - [ ]* 6.1 Write property tests P1–P4 for PCX
    - **Property P1: Round-trip** — decode(encode(m)).payload deep-equals m for ImagePayload models in supported layouts
    - **Property P2: Decoder totality** — detect/decode safety for arbitrary bytes
    - **Property P3: Annotation honesty** — no gaps or overlaps for encoded files
    - **Property P4: Truncation survivability** — prefix decoding never throws non-ExhumeError
    - **Validates: Requirements 3.1–3.6, 8.1–8.4, 9.1–9.3**
  - [ ]* 6.2 Write property test for PCX RLE round-trip (Property P6)
    - **Property P6: PCX RLE round-trip** — encoding then decoding arbitrary bytes with the PCX RLE codec produces the original bytes
    - **Validates: Requirements 3.4**
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_

- [ ] 7. IFF ILBM format module
  - Create `src/formats/ilbm/decode.ts`: throw `ExhumeError("not an IFF ILBM file")` if FORM/ILBM or FORM/PBM magic fails; parse chunk stream in `group("IFF")` (4-byte id, u32be size, 1 pad byte if odd, unknown chunks annotated + skipped); decode BMHD (20 fields including nPlanes validation 1–8 or 24), CMAP (size/3 RGB triples, greyscale ramp + warning if absent, truncate + warning if size not divisible by 3), CAMG (u32 flags, HAM bit 0x0800, EHB bit 0x0080), BODY (ByteRun1 per plane row or raw; HAM6 algorithm per row; EHB palette expansion to 64 entries; PBM chunky decode; fill index 0 + warning if BODY bytes missing); apply `assertLimit`
  - Create `src/formats/ilbm/encode.ts`: write FORM/ILBM, BMHD, CMAP, optional CAMG, BODY with ByteRun1 per plane row; support indexed encoding only (not HAM/EHB in encode); for 24-bit: nPlanes=24, no CMAP
  - Create `src/formats/ilbm/index.ts` exporting `FormatModule`: `detect` returns 0.95 for FORM+ILBM/PBM magic, 0.1 for FORM without correct subtype, 0 otherwise
  - Create `src/formats/ilbm/ilbm.test.ts` with example tests: HAM6 pixel computation for all four control values (hold, set-blue, set-red, set-green); EHB half-brightness palette expansion; PBM chunky decode; unknown chunk skipped without error; missing BODY produces empty pixels + warning
  - [ ]* 7.1 Write property tests P1–P4 for ILBM
    - **Property P1: Round-trip** — decode(encode(m)).payload deep-equals m for indexed ImagePayload models
    - **Property P2: Decoder totality** — detect/decode safety for arbitrary bytes
    - **Property P3: Annotation honesty** — no gaps or overlaps for encoded files
    - **Property P4: Truncation survivability** — prefix decoding never throws non-ExhumeError
    - **Validates: Requirements 4.1–4.7, 8.1–8.4, 9.1–9.3**
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_

- [ ] 8. dBASE DBF format module
  - Create `src/formats/dbf/decode.ts`: read 32-byte header in `group("header")` (version byte, lastUpdate YY+1900/MM/DD, recordCount u32, headerLength u16, recordLength u16, language driver at byte 29; warn for FoxPro versions 0x30/0x31/0xF5); read 32-byte field descriptors in `group("fieldDescriptors")` until 0x0D terminator (11-byte NUL-padded name, type char, length, decimals); `r.seek(headerLength)` to record data; for each record `group("record[n]")` (flag byte 0x20/0x2A, then each field decoded: C trim right spaces, N/F parse number + keep raw, D → ISO date, L → bool/null, M → null + warn once, C fields through code page decoder); if record count disagrees with file size decode what fits + warn; annotate 0x1A trailer
  - Create `src/formats/dbf/encode.ts`: write 32-byte header (version=0x03), field descriptors, 0x0D terminator, records with correct fixed widths, 0x1A trailer
  - Create `src/formats/dbf/index.ts` exporting `FormatModule`: `detect` returns 0.6 for version byte in {0x03,0x83,0x04,0x8B,0x30,0x31,0xF5}; boost to 0.8 if header length aligns with 32+32*N+1; +0.15 for `.dbf` extension (capped at 1.0)
  - Create `src/formats/dbf/dbf.test.ts` with example tests: all five field types (C/N/F/L/D/M); language driver selection (cp437/cp850/cp1252); deleted record flag; record count mismatch warning; truncated file decodes partial records + warning
  - [ ]* 8.1 Write property tests P1–P4 for DBF
    - **Property P1: Round-trip** — decode(encode(m)).payload deep-equals m for TablePayload models without memo fields
    - **Property P2: Decoder totality** — detect/decode safety for arbitrary bytes
    - **Property P3: Annotation honesty** — no gaps or overlaps for encoded files
    - **Property P4: Truncation survivability** — prefix decoding never throws non-ExhumeError
    - **Validates: Requirements 5.1–5.7, 8.1–8.4, 9.1–9.3**
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_

- [ ] 9. Lotus WK1 — values and structure
  - Create `src/formats/wk1/decode.ts`: throw `ExhumeError("not a WK1 file")` if first record type ≠ 0x0000; loop reading record type u16le, length u16le, then `length` bytes; dispatch by type: 0x0001 EOF stop, 0x0006 RANGE store, 0x0008 COLW1 store, 0x000B NAME store, 0x000C BLANK, 0x000D INTEGER (i16), 0x000E NUMBER (f64), 0x000F LABEL (NUL-terminated, strip alignment prefix, store `align`), 0x0010 FORMULA (decode format byte, f64 cached value, bytecode — leave formula string null in this task), 0x0033 STRING; decode format byte (bit 7 = protected, bits 4–6 = format type, bits 0–3 = decimals); convert date serial numbers to ISO dates (serial ≥ 61: 1899-12-30 + serial days; serial < 60: 1899-12-31 + serial days); apply `assertLimit` for column ≤ 255, row < limit per version; unknown record types annotated by number and skipped; sort cells by row then column
  - Create `src/formats/wk1/encode.ts`: write BOF (version 0x0406), RANGE, COLW1 records, NAME records, cell records in row-then-column order, EOF; FORMULA records re-encode bytecode if formula present, else write NUMBER with cached value
  - Create `src/formats/wk1/index.ts` exporting `FormatModule`: `detect` returns 0.9 for bytes 0–1 = 0x00 0x00 and bytes 4–5 = one of 0x04 0x04/0x04 0x05/0x04 0x06; +0.05 for `.wk1`/`.wks` extension
  - Create `src/formats/wk1/wk1.test.ts` with example tests: INTEGER/NUMBER/LABEL/BLANK cells; label alignment prefix stripping; date serial 60/61 boundary; COLW1 and NAME records; unknown record skipped; limit enforcement throws
  - [ ]* 9.1 Write property tests P1–P4 for WK1 (formulas excluded from P1 round-trip in this task)
    - **Property P1: Round-trip** — decode(encode(m)).payload deep-equals m for SheetPayload models with no formula cells
    - **Property P2: Decoder totality** — detect/decode safety for arbitrary bytes
    - **Property P3: Annotation honesty** — no gaps or overlaps for encoded files
    - **Property P4: Truncation survivability** — prefix decoding never throws non-ExhumeError
    - **Validates: Requirements 6.1–6.5, 6.7–6.9, 8.1–8.4, 9.1–9.3**
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_

- [ ] 10. Lotus WK1 — formula decompiler and Excel translator
  - Create `src/formats/wk1/formula.ts` implementing `decompileFormula(bytecode, col, row): string | null`: reverse-Polish stack machine covering opcodes 0x00 (f64 literal), 0x01 (cell ref: relative bit-15/absolute), 0x02 (range ref), 0x03 (end), 0x04 (parentheses), 0x05 (i16 literal), 0x06 (string literal), 0x08 (unary minus), 0x17 (unary plus), 0x09–0x0D (binary +−*/^), 0x0E–0x13 (comparisons), 0x14 (`#AND#`), 0x15 (`#OR#`), 0x16 (`#NOT#`), fixed-arity @functions, variable-arity functions (arg-count byte); relative reference: sign-extend 14-bit offset (bit 13 = sign), add to formula col/row, render as plain column+row; absolute reference: prefix `$`; column encoding A..IV (0=A, 25=Z, 26=AA, ..., 255=IV); range syntax `B2..B13`; unknown opcode returns null
  - Create `src/formats/wk1/xlsxFormula.ts` implementing `translateToExcel(lotusFormula): string | null`: strip leading `@`; rename all functions per the full mapping table (SUM/AVERAGE/COUNT/MIN/MAX/STDEV/VAR etc.); `..` → `:`; `#AND#` → `*`; `#OR#` → `+`; `#NOT#(x)` → `NOT(x)`; `@NA` → `NA()`; `@ERR` → null (use cell value `"#VALUE!"`); `@CELLPOINTER` or any unrecognised `@NAME` → null
  - Wire FORMULA record bytecode into `decode.ts` by calling `decompileFormula`; if null, keep cached f64 and add warning
  - Create `src/formats/wk1/formula.test.ts` with example tests: each opcode category; relative vs absolute reference; column-to-letter encoding A, Z, AA, IV; range syntax; unknown opcode returns null
  - [ ]* 10.1 Write property test P8 for WK1 formula decompile/re-encode round-trip
    - **Property P8: Formula decompile/re-encode round-trip** — for any generated formula expression tree (all supported operators and functions), encoding to bytecode, decompiling, re-encoding, and decompiling again produces the same formula string
    - **Validates: Requirements 6.6, 6.7**
  - _Requirements: 6.6, 6.7_

- [ ] 11. WordStar format module
  - Create `src/formats/wordstar/decode.ts`: walk bytes sequentially maintaining toggle state (bold 0x02, underline 0x13, italic 0x19, double-strike 0x04→bold, strikeout 0x18, superscript 0x14, subscript 0x16); at line start (after CRLF or offset 0) if byte = `.` read dot command line and dispatch (.PA → pageBreak block, .HE → meta.header, .FO → meta.footer, `..`/`.IG` discard, all others → meta.dotCommands); handle 0x1A (^Z) stop + annotate trailing padding; 0x1D + u16le-length → skip entire sequence + warn once "5.x formatting was ignored"; 0x0D 0x0A hard return → end paragraph, push to blocks, reset toggle state; 0x8D 0x0A soft CR → join lines with space; 0xA0 → emit space; 0x8A → skip; 0x08 overprint → drop both chars; 0x0F non-breaking space → space in run; 0x1E inactive soft hyphen → drop; 0x1F active soft hyphen → drop + join word; 0x09 tab → preserve; 0x0C → pageBreak block; strip bit 7 for other bytes; flush open paragraph at EOF
  - Create `src/formats/wordstar/encode.ts`: write body bytes per paragraph applying toggle bytes for attribute transitions; hard CRLF at paragraph end; `.HE`/`.FO` dot commands for header/footer; set bit 7 on last character of each word; ^Z at end
  - Create `src/formats/wordstar/index.ts` exporting `FormatModule`: heuristic `detect` scoring high-bit ratio × 0.5 for letter+space/punctuation pairs; +0.2 for 0x8D 0x0A presence; +0.1 per distinct dot command found (capped +0.2); hard cap 0.05 if NUL byte present; ≤ 0.1 for pure 7-bit ASCII with no recognised dot commands; max achievable 0.95
  - Create `src/formats/wordstar/wordstar.test.ts` with example tests: all toggle control bytes; soft-CR line joining; .PA dot command emits pageBreak; .HE sets meta.header; 5.x sequence 0x1D skipped + single warning; ^Z stops decode; pure ASCII scores ≤ 0.1; overprint drops both chars
  - [ ]* 11.1 Write property tests P1–P4 for WordStar
    - **Property P1: Round-trip** — decode(encode(m)).payload deep-equals m for DocumentPayload models with supported formatting
    - **Property P2: Decoder totality** — detect/decode safety for arbitrary bytes
    - **Property P3: Annotation honesty** — no gaps or overlaps for encoded files
    - **Property P4: Truncation survivability** — prefix decoding never throws non-ExhumeError
    - **Validates: Requirements 7.1–7.8, 8.1–8.4, 9.1–9.3**
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_

- [ ] 12. Checkpoint — format modules complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Samples generator
  - Create `src/samples/` directory with one script per format that calls the format's `encode()` with original content (a small drawing, a mini spreadsheet, a 3-field table, a short letter)
  - Create `scripts/gen-samples.ts` (or `.mjs`) invoked by `npm run samples` that runs all six generators and writes output to `public/samples/<id>.{mac,pcx,lbm,wk1,dbf,ws}`
  - Add a `public/samples/manifest.json` listing each sample's filename, display name, and description string for the UI
  - Ensure `npm run samples` completes without error and each file decodes with no `ExhumeError`
  - _Requirements: 20.1, 20.2, 20.3_

- [ ] 14. UI shell and Graveyard
  - Create `src/ui/theme.css` with CSS custom properties: `--night`, `--soil`, `--stone`, `--bone`, `--moss`, `--ember`, `--phosphor`, `--blood`
  - Update `src/App.tsx` with `useReducer` state (`AppState`: screen, specimen, selectedAnnotation, selectedOffset, showDeleted, zoom) and routing between `"graveyard"` and `"viewer"` screens
  - Create `src/ui/Graveyard.tsx` composing six `FormatTombstone` components and a `DropZone`
  - Create `src/ui/FormatTombstone.tsx` displaying id, name, born/died years, epitaph, hover lift animation respecting `prefers-reduced-motion`; keyboard-activatable (Enter/Space loads the sample for that format); focusable with visible `--ember` focus ring
  - Create `src/ui/DropZone.tsx` with drag-and-drop and file input, `aria-label`, keyboard accessible, `aria-live` region announcing "Exhuming…", "Done", and error messages; reads file as `Uint8Array` and calls `registry.dispatch()`
  - Register all six format modules in `src/core/registry.ts` and confirm `npm run typecheck` passes
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 21.1, 22.1, 22.2, 22.3, 22.4_

- [ ] 15. Image Viewer
  - Create `src/ui/ImageViewer.tsx` rendering decoded `ImagePayload` onto an HTML `<canvas>` with `image-rendering: pixelated`; handle 1-bpp palettised (MSB = leftmost pixel), 8-bpp palettised, and 24-bpp RGB pixel layouts
  - Add integer zoom controls (buttons + keyboard) that scale by whole multiples with no sub-pixel interpolation
  - Wrap MacPaint images in a System 1-style Macintosh window frame; wrap PCX and ILBM images in a period-correct platform frame
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 16. Sheet Viewer
  - Create `src/ui/SheetViewer.tsx` with a virtualised grid, green-phosphor CRT-style frame, A..IV column headers (derived from column index), 1-based row numbers, and column widths from `columnWidths` record
  - Add a formula bar above the grid showing the decompiled formula string for the selected cell, or the formatted display value if no formula is present
  - Implement formatted cell display values for all format byte types: fixed-decimal, scientific, currency, percent, comma-separated, and all date/time sub-formats (D-MMM-YY, D-MMM, MMM-YY, MM/DD/YY, MM/DD, HH:MM:SS AM/PM, HH:MM AM/PM, HH:MM:SS 24h, HH:MM 24h)
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] 17. Table Viewer
  - Create `src/ui/TableViewer.tsx` with column headers derived from field names and types in a dBASE dot-prompt-style browse frame
  - Render logically-deleted records with CSS `text-decoration: line-through`
  - Add a toggle button to show or hide deleted records; hidden records remain in `specimen.payload.records`
  - _Requirements: 13.1, 13.2, 13.3_

- [ ] 18. Document Viewer
  - Create `src/ui/DocumentViewer.tsx` rendering `DocumentPayload.blocks` as paragraphs with inline `TextRun` spans; apply bold, italic, underline, strikethrough, superscript, and subscript via HTML/CSS
  - Render `pageBreak` blocks as visible horizontal separators
  - Wrap the document in a fan-fold dot-matrix-paper-style frame
  - _Requirements: 14.1, 14.2, 14.3_

- [ ] 19. Autopsy view
  - Create `src/ui/HexPane.tsx` displaying 16 bytes/row with an offset column, coloured annotation spans (colour keyed to tree depth), and an ASCII column; each span has an accessible `aria-label`; clicking a byte reveals its deepest annotation node
  - Create `src/ui/AnnotationTree.tsx` as a collapsible tree where clicking a node highlights its byte range in `HexPane` and scrolls to it; bidirectional selection is managed via `AppState.selectedAnnotation` and `AppState.selectedOffset`
  - Create `src/ui/Autopsy.tsx` composing `HexPane` and `AnnotationTree` in a two-pane layout (stacks on narrow screens)
  - Create `src/ui/CornerReport.tsx` as a collapsible warning list with the heading "Coroner's Report"; displayed alongside the content view, never replacing it
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 22.5_

- [ ] 20. Checkpoint — viewers complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Export — PNG and CSV
  - Create `src/export/png.ts`: write a minimal valid PNG (8-byte signature, IHDR, optional PLTE for indexed, IDAT via `fflate.deflateSync`, IEND); filter byte 0 (None) prepended to each scanline; colour type 0 (greyscale) for 1-bpp, 3 (indexed) for palettised, 2 (RGB) for 24-bit; no DOM dependency
  - Create `src/export/csv.ts`: RFC 4180 output with `,` separator and `\r\n` row terminator; quote fields containing `,`, `"`, `\r`, or `\n`; double internal `"`; sheets use formatted display value; tables use decoded field string
  - Create `src/ui/ExportBar.tsx` rendering format-appropriate export buttons ("Reincarnate") that trigger browser download via `URL.createObjectURL`
  - [ ]* 21.1 Write property test P7 for CSV round-trip
    - **Property P7: CSV export round-trip** — for any two-dimensional array of strings (no embedded NUL characters), exporting to CSV and parsing back produces the original array
    - **Validates: Requirements 16.1, 16.2**
  - _Requirements: 15.1, 15.2, 16.1, 16.2, 16.3_

- [ ] 22. Export — XLSX and formula translation
  - Create `src/export/xlsx.ts`: minimal OOXML writer using `fflate.zip`; ZIP entries: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/worksheets/sheet1.xml`, `xl/sharedStrings.xml`; string cells reference shared strings by zero-based index with `t="s"`; number cells `<c><v>…</v></c>`; formula cells `<c><f>…</f><v>…</v></c>` or `<c t="str"><f>…</f><v>…</v></c>` for string formulas; date values as ISO strings in string cells
  - Wire `translateToExcel` into the XLSX exporter for WK1 sheets: cells with a formula use the translated Excel formula string; if `translateToExcel` returns null write a plain number cell with the cached value and add a warning
  - [ ]* 22.1 Write property test P9 for XLSX output
    - **Property P9: XLSX valid ZIP with every cell** — for any SheetPayload or TablePayload with up to 10 000 cells, the XLSX bytes are a valid ZIP parseable by `fflate.unzip` containing `xl/worksheets/sheet1.xml` whose text includes every non-blank cell value
    - **Validates: Requirements 17.4**
  - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [ ] 23. Export — JSON, Markdown, and HTML
  - Create `src/export/json.ts`: sheets → array-of-objects keyed by column address (e.g. `{"A": "Name", "B": 42}`); tables → array-of-objects keyed by field name; date values as ISO 8601 `"YYYY-MM-DD"`; deleted records include `"_deleted": true`
  - Create `src/export/markdown.ts`: paragraphs separated by blank lines; `**bold**`, `_italic_`, `<u>underline</u>`, `~~strike~~`, `<sup>…</sup>`, `<sub>…</sub>`; page breaks → `\n---\n`
  - Create `src/export/html.ts`: semantic HTML5 fragment (no `<html>/<body>` wrapper); paragraphs in `<p>`; `<strong>`, `<em>`, `<u>`, `<s>`, `<sup>`, `<sub>`; page breaks → `<hr>`
  - Add JSON, Markdown, HTML, and plain-text buttons to `ExportBar.tsx` for the appropriate payload kinds
  - _Requirements: 18.1, 18.2, 19.1, 19.2, 19.3_

- [ ] 24. MCP autopsy and decode tools
  - Add `autopsy` tool to `mcp/server.mjs`: read file, call `registry.dispatch()`, return `{ annotations: Annotation[] }` as the tool content JSON
  - Add `decode` tool to `mcp/server.mjs`: read file, call `registry.dispatch()`, return `{ specimen: Specimen }` with full payload, annotations, warnings, and meta
  - Ensure `ExhumeError` from either tool returns `{ error: message }` and does not crash the server
  - _Requirements: 23.4, 23.5_

- [ ] 25. Offline / PWA, accessibility pass, and deploy workflow
  - Add a service worker (Vite PWA plugin or hand-written `public/sw.js`) that pre-caches all static assets on first load; no user file data ever touches the cache
  - Add a persistent, visible privacy notice to the UI: "All files decoded locally. Nothing leaves your browser."
  - Audit all interactive elements: visible `--ember` focus ring on every focusable element; `aria-live` regions announce "Exhuming…", "Done", and error messages; minimum 4.5:1 contrast ratio for all text; Autopsy colour spans carry text labels (no information by colour alone); keyboard tab order through tombstones, drop zone, zoom controls, export buttons, and autopsy tree
  - Create `.github/workflows/deploy.yml` with steps: checkout → install → `npm run typecheck` → `npm test` → `npm run build` → deploy `dist/` to GitHub Pages; `VITE_BASE` read from env
  - _Requirements: 21.1, 21.2, 21.3, 22.1, 22.2, 22.3, 22.4, 22.5_

- [ ] 26. Final checkpoint — full suite passes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints 12, 20, and 26 ensure incremental validation at logical breaks
- Property tests P1–P4 apply to every format module; P5–P9 test cross-cutting codecs and exports
- `npm run typecheck` and `npm test` must pass before any task is considered done

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "4"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["11.1"] },
    { "id": 10, "tasks": ["12"] },
    { "id": 11, "tasks": ["13", "14"] },
    { "id": 12, "tasks": ["15", "16", "17", "18", "19"] },
    { "id": 13, "tasks": ["20"] },
    { "id": 14, "tasks": ["21.1", "22.1", "23", "24"] },
    { "id": 15, "tasks": ["25"] },
    { "id": 16, "tasks": ["26"] }
  ]
}
```
