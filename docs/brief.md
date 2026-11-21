# Exhume: product brief (input to the Kiro spec)

Kiroween 2026, category Resurrection. One sentence: **drop a dead file, get it back.**

## Scope of version 1
Six formats, one per `docs/formats/<id>.md`:

| id | format | kind | born-died |
|---|---|---|---|
| macpaint | MacPaint | image | 1984-1988 |
| pcx | PC Paintbrush PCX | image | 1985-2000 |
| ilbm | Amiga IFF ILBM (Deluxe Paint) | image | 1985-1996 |
| wk1 | Lotus 1-2-3 WKS/WK1 | sheet | 1983-1995 |
| dbf | dBASE III/IV table | table | 1980-1995 |
| wordstar | WordStar 3.x/4.0 document | document | 1978-1992 |

## What the user can do
1. **Graveyard.** See six tombstones. Drop a file anywhere, pick one with the keyboard, or open a
   built-in sample specimen. Exhume identifies the format from the bytes (not the extension).
2. **Viewer.** See the content in a period frame: images on a pixel-perfect canvas with integer zoom;
   sheets as a grid with A..IV column letters, formatted values and the decompiled formula for the
   selected cell; tables with typed columns and struck-through deleted rows that can be shown or hidden;
   documents with bold, italic, underline, page breaks.
3. **Autopsy.** See every byte in a hex view. Structures found by the decoder are coloured spans; a tree
   lists them; selecting a tree node highlights its bytes and selecting a byte reveals its node with its
   decoded value ("bytesPerLine = 80").
4. **Coroner's report.** A list of warnings: what was damaged, unsupported or ignored.
5. **Reincarnate.** Export: images to PNG; sheets to CSV, XLSX (values, and formulas translated to Excel
   syntax when every function maps) and JSON; tables to CSV, XLSX and JSON; documents to Markdown, HTML
   and plain text; any specimen's autopsy to JSON.
6. **Offline and private.** Everything runs in the browser tab. The page says so and it is true.

## Engineering shape
- Each format is a `FormatModule` (see steering `structure.md`) with `detect`, `decode`, `encode`.
- Encoders exist for two reasons: they generate the built-in sample files (`npm run samples`) and they
  make round-trip property tests possible.
- Properties P1-P4 in steering `formats.md` hold for every format and are tested with fast-check.
- Extra properties: PackBits and PCX RLE codecs round-trip arbitrary bytes; CSV export parses back to
  the same cell text; the WK1 formula decompiler output re-parses to the same bytecode for generated
  formula trees; XLSX output is a valid zip whose sheet XML contains every cell.
- `mcp/server.mjs` (exhume-mcp) exposes `identify`, `hexdump`, `autopsy` and `decode` over stdio so
  an agent working on a decoder can look inside a binary fixture instead of guessing.
- Built-in samples are original content made for this project (no third-party files are shipped).

## Out of scope for version 1
Editing files, writing legacy formats from user content, memo (.dbt) files, WordStar 5+ formatting,
Lotus WK3/WK4, cloud anything.

## Definition of done
`npm run typecheck`, `npm test` and `npm run build` pass; all six samples open, show an autopsy with no
gaps, and export; the deployed page works offline after first load.
