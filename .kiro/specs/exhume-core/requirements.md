# Requirements Document

## Introduction

Exhume is a static browser application that decodes legacy file formats — MacPaint drawings, PC Paintbrush PCX images, Amiga IFF ILBM pictures, Lotus 1-2-3 worksheets, dBASE tables, and WordStar documents — entirely on the user's device, with no server involvement.

The application presents three views: a **Graveyard** home screen with one tombstone per supported format and a file drop zone; a **Viewer** that renders the decoded content in a period-correct frame; and an **Autopsy** that maps every byte in the file to a labelled, coloured annotation span. Users can then **Reincarnate** (export) the decoded content to modern formats — PNG, CSV, XLSX, JSON, Markdown, HTML, or plain text — depending on the kind of file.

Built-in sample specimens ship with the app so it can be explored without owning an old file. The MCP server at `mcp/server.mjs` exposes the same decoders as stdio tools for agent-assisted inspection of binary fixtures.

## Glossary

**Specimen** — The structured result of decoding a file. Carries `payload` (the decoded content), `annotations` (byte-span tree for the Autopsy), `warnings` (issues encountered during decoding), and `meta` (dimensions, record counts, dates, and similar summary data).

**Annotation** — A named, coloured span `{start, end, label, color, children}` that maps a contiguous range of bytes to its decoded meaning. Annotations form a tree mirroring the structure found by the decoder.

**FormatModule** — The TypeScript module implementing one legacy format. Exports `id`, `name`, `born`, `died`, `extensions`, `kind`, `epitaph`, `detect`, `decode`, and optionally `encode`. Registered in `src/core/registry.ts`.

**Autopsy** — The two-pane view that shows raw hex bytes on the left and the annotation tree on the right. Selecting an annotation highlights its byte range; selecting a byte reveals its annotation.

**Reincarnate** — The export step that converts a decoded Specimen to a modern format: PNG for images, CSV/XLSX/JSON for sheets and tables, Markdown/HTML/plain text for documents.

**Warning** — A named, human-readable record of anything the decoder could not fully recover: damaged bytes, unsupported features, missing companion files, encoding ambiguities. Warnings never block content display.

## Requirements

### Requirement 1: Format Identification

**User Story:** As a user dropping a file onto Exhume, I want the application to identify the file format from its byte content, so that I do not need to know or specify what kind of file it is.

#### Acceptance Criteria

1. WHEN a file is dropped or opened, THE SYSTEM SHALL pass the file bytes and filename to every registered FormatModule's `detect` function and select the module with the highest confidence score.
2. WHEN two or more modules return the same highest confidence score, THE SYSTEM SHALL prefer the module whose extension list contains the file's extension, and if still tied, the module registered first.
3. THE SYSTEM SHALL treat a confidence score of 0.5 or above as a successful identification and proceed to decode with that module.
4. IF no module returns a confidence score of 0.5 or above, THEN THE SYSTEM SHALL display an "unrecognised format" error without attempting to decode.
5. THE SYSTEM SHALL ensure that every `detect` implementation returns a number in the closed interval [0, 1] and never throws.
6. WHERE a filename is not available, THE SYSTEM SHALL run identification on bytes alone and not penalise any module for a missing extension.

---

### Requirement 2: MacPaint Decoder

**User Story:** As a user with a MacPaint file from an old Macintosh disk, I want Exhume to decode the 576×720 1-bit bitmap, so that I can see and export the original drawing.

#### Acceptance Criteria

1. WHEN decoding a MacPaint file that begins with a MacBinary wrapper (byte 0 = 0x00, byte 1 in range 1–63, bytes 65–68 = `PNTG`, byte 74 = 0, byte 82 = 0), THE SYSTEM SHALL skip the 128-byte wrapper and decode the data fork beginning at byte 128.
2. THE SYSTEM SHALL read the 512-byte document header, record the version u32 at offset 0, and annotate the 38 brush patterns (8×8, 1 bit per pixel) at offsets 4–307.
3. IF the version u32 is neither 0 nor 2, THEN THE SYSTEM SHALL add a warning and continue decoding.
4. WHEN decoding the bitmap, THE SYSTEM SHALL apply PackBits row by row: a signed control byte `n` in range 0–127 copies the next `n+1` bytes literally; `n` in range −127 to −1 repeats the next byte `1−n` times; `n` = −128 (0x80) is a no-op.
5. THE SYSTEM SHALL stop decompression after emitting exactly 51 840 output bytes (576 × 720 × 1 bpp / 8), producing a pixel array where 1 = black and 0 = white with MSB as the leftmost pixel.
6. IF the compressed input is exhausted before 51 840 bytes are produced, THEN THE SYSTEM SHALL fill remaining pixels with white (0) and add a warning.
7. THE SYSTEM SHALL produce a Specimen with payload `{ kind:"image", width:576, height:720, bitsPerPixel:1, palette:[[255,255,255],[0,0,0]], pixels:Uint8Array, patterns:Uint8Array[38] }`.

---

### Requirement 3: PCX Decoder

**User Story:** As a user with a PC Paintbrush PCX file, I want Exhume to decode the image for all standard layouts, so that I can view and export it regardless of colour depth or compression.

#### Acceptance Criteria

1. THE SYSTEM SHALL validate that byte 0 of the file is 0x0A; IF it is not, THEN THE SYSTEM SHALL throw ExhumeError("not a PCX file").
2. THE SYSTEM SHALL read the 128-byte PCX header and annotate all fields: manufacturer, version, encoding, bitsPerPixel, nPlanes, bytesPerLine, xMin/yMin/xMax/yMax, EGA palette (16 RGB triples), and paletteInfo.
3. THE SYSTEM SHALL decode the following pixel layouts and reject anything else with ExhumeError("unsupported PCX layout"): 1 bpp × 1 plane (monochrome), 1 bpp × 4 planes (EGA 16-colour planar), 4 bpp × 1 plane (16-colour packed, high nibble first), 8 bpp × 1 plane (256-colour VGA), 8 bpp × 3 planes (24-bit RGB), 2 bpp × 1 plane (CGA 4-colour, fixed palette, add warning).
4. WHEN decoding RLE-compressed scan data, THE SYSTEM SHALL treat a byte `b` where `(b & 0xC0) == 0xC0` as a run: count = `b & 0x3F`, value = next byte repeated `count` times; all other bytes are literals. Run sequences that cross scanline boundaries SHALL be tolerated during decode.
5. WHEN encoding=0 (uncompressed) is present, THE SYSTEM SHALL decode the raw scan data and add a warning that the file uses uncompressed encoding.
6. WHEN version=5 and the layout is 8 bpp × 1 plane, THE SYSTEM SHALL read the VGA palette: IF the byte at `fileLength − 769` equals 0x0C, it is followed by 256 RGB triples; IF absent, THE SYSTEM SHALL use a greyscale ramp and add a warning.
7. THE SYSTEM SHALL produce a Specimen with payload `{ kind:"image", width, height, bitsPerPixel:1|4|8|24, palette?:[r,g,b][], pixels:Uint8Array }` where indexed images use one byte per pixel (palette index) and 24-bit images use 3 bytes per pixel (RGB, no palette).

---

### Requirement 4: IFF ILBM Decoder

**User Story:** As a user with an Amiga Deluxe Paint IFF file, I want Exhume to decode the ILBM image including HAM, EHB, and 24-bit modes, so that I can view the original artwork.

#### Acceptance Criteria

1. THE SYSTEM SHALL validate the IFF container: bytes 0–3 must be `FORM`, bytes 8–11 must be `ILBM` or `PBM `; IF either is absent, THEN THE SYSTEM SHALL throw ExhumeError("not an IFF ILBM file").
2. THE SYSTEM SHALL parse the chunk stream: each chunk has a 4-byte id, a u32 big-endian size, `size` bytes of data, and 1 pad byte when `size` is odd; unknown chunk IDs SHALL be annotated with their id and skipped without error.
3. WHEN a BMHD chunk is present, THE SYSTEM SHALL decode: width, height (u16), x/y origin (i16), nPlanes (u8, valid values 1–8 and 24), masking (u8), compression (0=none, 1=ByteRun1), pad byte, transparentColor (u16), xAspect/yAspect (u8), pageWidth/pageHeight (i16).
4. WHEN a CMAP chunk is present, THE SYSTEM SHALL decode `size/3` RGB triples as the palette; IF CMAP is absent, THE SYSTEM SHALL build a greyscale ramp palette and add a warning.
5. WHEN a CAMG chunk is present, THE SYSTEM SHALL read the u32 Amiga viewport flags: bit 0x0800 signals HAM mode; bit 0x0080 signals EHB (extra half-brite) mode.
6. WHEN decoding BODY rows with compression=1, THE SYSTEM SHALL decompress each plane row separately using ByteRun1 (identical to PackBits); IF BODY bytes are missing, THE SYSTEM SHALL fill the remaining pixels with index 0 and add a warning.
7. WHEN the FORM type is `PBM ` and nPlanes=8, THE SYSTEM SHALL decode BODY rows as chunky bytes, one byte per pixel, with each row padded to even length.
8. THE SYSTEM SHALL decode these colour modes: indexed (1–8 planes, pixel index = bits from planes, plane 0 = LSB, MSB of each byte = leftmost pixel); EHB (6 planes with CAMG EHB bit or exactly 32 CMAP entries, indices 32–63 map to colours 0–31 at half brightness); HAM6 (6 planes with CAMG HAM bit, top-2 bits of pixel select hold/set-blue/set-red/set-green, low 4 bits scaled by multiplying by 17, each row starts at palette colour 0); 24-plane direct RGB (planes 0–7 = red, 8–15 = green, 16–23 = blue).
9. THE SYSTEM SHALL produce a Specimen with payload `{ kind:"image", width, height, bitsPerPixel, palette?:[r,g,b][], pixels:Uint8Array }` where EHB expands the palette to 64 entries and HAM/24-plane images are emitted as 24-bit with 3 bytes per pixel.

---

### Requirement 5: dBASE DBF Decoder

**User Story:** As a researcher with a dBASE database file, I want Exhume to decode all records and field types, so that I can inspect and export the data including logically-deleted rows.

#### Acceptance Criteria

1. THE SYSTEM SHALL read the 32-byte DBF header: version byte, last-update YY/MM/DD (year + 1900), record count u32, header length u16, record length u16, and language driver id at byte 29.
2. THE SYSTEM SHALL recognise version bytes: 0x03 (dBASE III), 0x83 (dBASE III+ with memo), 0x04 (dBASE IV), 0x8B (dBASE IV with memo); for FoxPro version bytes 0x30, 0x31, and 0xF5 THE SYSTEM SHALL attempt decoding and add a warning.
3. THE SYSTEM SHALL read 32-byte field descriptors until a 0x0D terminator byte, extracting: 11-byte NUL-padded name, type character, length byte, and decimal count byte.
4. THE SYSTEM SHALL decode records starting at the header-length offset: each record begins with a flag byte (0x20 = live, 0x2A = deleted), followed by fixed-width field values in declaration order.
5. THE SYSTEM SHALL decode field types: `C` — trim trailing spaces; `N` and `F` — keep the raw ASCII text and also parse as a number (spaces-only = null); `D` — parse YYYYMMDD as ISO date string YYYY-MM-DD (eight spaces = null); `L` — T/t/Y/y = true, F/f/N/n = false, `?` or space = null; `M` — set value to null and add one table-level warning "memo fields need the .dbt file".
6. THE SYSTEM SHALL apply text decoding using the language driver id: 0x01 → CP437, 0x02 → CP850, 0x03 → CP1252; unknown id → CP437, and add a warning if any byte ≥ 0x80 is encountered.
7. THE SYSTEM SHALL include deleted records in the Specimen payload with `deleted:true`; the UI may show or hide them separately.
8. IF the record count in the header disagrees with the number of complete records present in the file, THEN THE SYSTEM SHALL decode the records that do fit and add a warning.
9. THE SYSTEM SHALL produce a Specimen with payload `{ kind:"table", fields:[{name,type,length,decimals}], records:[{deleted:boolean, values:(string|number|boolean|null)[]}], lastUpdate:"YYYY-MM-DD" }`.

---

### Requirement 6: Lotus WK1 Decoder

**User Story:** As a researcher with a Lotus 1-2-3 worksheet file, I want Exhume to decode all cells and decompile formulas, so that I can examine the data and calculations.

#### Acceptance Criteria

1. WHEN decoding a WK1 file, THE SYSTEM SHALL read the record stream: each record is a u16 type, u16 length, then `length` bytes; the first record must be BOF (type 0x0000) with a version u16 (0x0404 = 1-2-3 1A, 0x0405 = Symphony, 0x0406 = 1-2-3 2.x); IF the first record is not BOF, THEN THE SYSTEM SHALL throw ExhumeError("not a WK1 file").
2. THE SYSTEM SHALL decode these record types: EOF (0x0001, stop), RANGE (0x0006, used range), COLW1 (0x0008, column width), NAME (0x000B, named range), BLANK (0x000C), INTEGER (0x000D, i16 value), NUMBER (0x000E, f64 value), LABEL (0x000F, NUL-terminated string), FORMULA (0x0010, f64 cached value + bytecode), STRING (0x0033, text result of string formula); unknown record types SHALL be annotated by their type number and skipped without warning.
3. THE SYSTEM SHALL decode the format byte for each cell: bit 7 = protected flag; bits 4–6 = format type (0=fixed, 1=scientific, 2=currency, 3=percent, 4=comma, 7=special); bits 0–3 = decimal places; for type 7 the nibble encodes date and time sub-formats and the special `+/−` bar, hidden, text, and default formats as specified in `docs/formats/wk1.md`.
4. THE SYSTEM SHALL strip the label alignment prefix (`'` left, `"` right, `^` centre, `\` repeat) from LABEL and STRING record values and store it as `align`.
5. THE SYSTEM SHALL convert date serial numbers to ISO calendar dates: for serial ≥ 61, date = 1899-12-30 plus the serial number of days; for serial < 60, date = 1899-12-31 plus the serial number of days.
6. WHEN decoding FORMULA bytecode, THE SYSTEM SHALL decompile the reverse-Polish bytecode to 1-2-3 formula text using the full opcode table in `docs/formats/wk1.md`; in a cell reference coordinate u16, bit 15 set means the low 14 bits are a signed offset from the formula cell, bit 15 clear means an absolute coordinate (prefixed with `$`).
7. IF a FORMULA record contains an unknown opcode, THEN THE SYSTEM SHALL keep the cached f64 value, set `formula` to null, and add a warning; THE SYSTEM SHALL NOT guess the formula.
8. THE SYSTEM SHALL enforce these limits: 256 columns (A through IV), 8192 rows for version 2.x, 2048 rows for version 1A and Symphony; counts above these limits SHALL cause ExhumeError.
9. THE SYSTEM SHALL produce a Specimen with payload `{ kind:"sheet", version:"1A"|"2"|"symphony", range?, columnWidths:Record<number,number>, names:[{name,range}], cells:[{col,row,type,value,formula?,align?,format:{type,decimals,protected}}] }` with cells sorted by row then column.

---

### Requirement 7: WordStar Decoder

**User Story:** As a researcher with a WordStar document, I want Exhume to decode the text and formatting, so that I can read the document and export it to a modern format.

#### Acceptance Criteria

1. WHEN detecting a WordStar file, THE SYSTEM SHALL score these signals: ratio of bytes with bit 7 set whose low 7 bits form a letter character followed by a space or punctuation byte; presence of the byte pair 0x8D 0x0A (soft carriage return); lines beginning with known dot commands; absence of NUL bytes; pure 7-bit ASCII with no recognised dot commands SHALL yield a confidence score ≤ 0.1.
2. WHEN decoding body text, THE SYSTEM SHALL strip bit 7 to obtain the ASCII text byte; byte 0xA0 is a soft space and SHALL be treated as a single space; byte pair 0x8D 0x0A is a soft carriage return and SHALL join the two lines with a single space; byte 0x8A alone is a soft line feed and SHALL be ignored.
3. THE SYSTEM SHALL apply these control-byte toggles (each byte toggles the named attribute on and off until toggled again or end of paragraph): 0x02 bold, 0x13 underline, 0x19 italic, 0x04 double-strike (rendered as bold), 0x18 strikeout, 0x14 superscript, 0x16 subscript.
4. THE SYSTEM SHALL handle these control bytes non-toggle: 0x08 overprint-previous-character (drop both characters); 0x0F non-breaking space (preserve as a space in the run); 0x1E inactive soft hyphen (drop); 0x1F active soft hyphen at a soft line end (drop, join the word); 0x09 tab (preserve); 0x0C page break (emit a pageBreak block).
5. WHEN byte 0x1A (^Z, CP/M end-of-file) is encountered, THE SYSTEM SHALL stop decoding and treat any subsequent bytes as trailing padding.
6. WHEN a line in the file begins with `.`, THE SYSTEM SHALL treat it as a dot command and not emit it as body text: `.PA` emits a pageBreak block; `.HE` text sets `meta.header`; `.FO` text sets `meta.footer`; `..` and `.IG` are comments (discard); all other dot commands are stored in `meta.dotCommands` and otherwise ignored.
7. WHEN a byte sequence 0x1D u16le-length payload 0x1D is encountered (WordStar 5+ inline sequence), THE SYSTEM SHALL skip the entire sequence and add one warning "5.x formatting was ignored"; THE SYSTEM SHALL add this warning at most once per file.
8. THE SYSTEM SHALL treat byte pair 0x0D 0x0A with neither byte having bit 7 set as a hard return ending the current paragraph.
9. THE SYSTEM SHALL produce a Specimen with payload `{ kind:"document", blocks:[{type:"paragraph", runs:[{text,bold?,italic?,underline?,strike?,sup?,sub?}]}|{type:"pageBreak"}], header?:string, footer?:string }` and `meta.dotCommands` containing any unrecognised dot command lines.

---

### Requirement 8: Damaged Input and Hard Limits

**User Story:** As a user supplying any byte sequence — intentional or corrupted — I want the application to never crash or hang, so that I always receive either a decoded specimen or a clear error.

#### Acceptance Criteria

1. THE SYSTEM SHALL define maximum safe values for image dimensions, pixel counts, record counts, and decompressed sizes in `src/core/limits.ts`; WHEN a decoder encounters a value that exceeds the corresponding limit, THE SYSTEM SHALL throw ExhumeError with a message naming the limit that was exceeded.
2. WHEN decoding any prefix of a valid encoded file, THE SYSTEM SHALL return either a Specimen or throw ExhumeError; it SHALL NOT throw any error that is not an ExhumeError, and it SHALL NOT hang.
3. IF decoding is cut short by truncation, THEN THE SYSTEM SHALL return a Specimen for whatever content was successfully decoded, and that Specimen SHALL carry at least one warning indicating truncation.
4. WHEN decoding an arbitrary byte sequence that is not a recognisable format, THE SYSTEM SHALL throw ExhumeError rather than returning an empty or nonsensical Specimen.
5. THE SYSTEM SHALL ensure that the `detect` function of every FormatModule returns a value in [0, 1] for any input length including zero bytes.

---

### Requirement 9: Annotations and Autopsy View

**User Story:** As a developer or archivist, I want to see every byte in the file labelled with its decoded meaning, so that I can understand the file's internal structure.

#### Acceptance Criteria

1. WHEN a decoder reads bytes through ByteReader, THE SYSTEM SHALL automatically record each read as an Annotation span with the field name as the label, without requiring the decoder to call a separate annotation API.
2. THE SYSTEM SHALL organise annotations into a tree using `ByteReader.group(label, fn)`: all reads inside `fn` become children of an annotation with the given label.
3. WHEN a file is produced by the FormatModule's `encode` function, THE SYSTEM SHALL ensure that the resulting Specimen's top-level annotations cover every byte exactly once — no gaps and no overlaps.
4. WHEN a user selects an annotation node in the Autopsy tree, THE SYSTEM SHALL highlight the corresponding byte range in the hex view.
5. WHEN a user selects a byte in the hex view, THE SYSTEM SHALL reveal and highlight the annotation node whose span contains that byte.
6. THE SYSTEM SHALL ensure that every Annotation span's start and end offsets are within the bounds of the file being decoded.

---

### Requirement 10: Warnings — Coroner's Report

**User Story:** As a user viewing a partially-damaged or partially-unsupported file, I want to see a list of issues the decoder encountered, so that I know what content could not be recovered.

#### Acceptance Criteria

1. WHEN a decoder encounters an unsupported feature, damaged bytes, or a missing companion file, THE SYSTEM SHALL record a Warning with a human-readable message and, where known, the byte offset of the issue.
2. THE SYSTEM SHALL display the Warning list in the UI as a named "Coroner's Report" section that is visible alongside the decoded content.
3. WHILE warnings are present, THE SYSTEM SHALL continue displaying all successfully decoded content and SHALL NOT block or replace the content view with an error screen.
4. THE SYSTEM SHALL deduplicate warnings where the same condition occurs repeatedly (for example, the "5.x formatting was ignored" warning for WordStar), emitting each distinct message at most once per decode call.

---

### Requirement 11: Image Viewer

**User Story:** As a user viewing a decoded image, I want it rendered at the correct pixel dimensions with period-correct chrome, so that the image looks as it did on the original hardware.

#### Acceptance Criteria

1. THE SYSTEM SHALL render decoded images to an HTML `<canvas>` element with `image-rendering: pixelated` and an integer zoom factor.
2. THE SYSTEM SHALL interpret the MSB of each pixel byte as the leftmost pixel when rendering 1-bit and planar images.
3. WHERE the image kind is MacPaint, THE SYSTEM SHALL render it inside a System 1-style Macintosh window frame.
4. WHERE the image kind is PCX or ILBM, THE SYSTEM SHALL render it inside a period-correct frame appropriate to the source platform.
5. THE SYSTEM SHALL provide zoom controls that change the display scale by integer multiples and SHALL NOT apply sub-pixel interpolation.

---

### Requirement 12: Sheet Viewer

**User Story:** As a researcher with a Lotus WK1 file, I want to see the spreadsheet rendered in a period-correct grid, so that I can read cell values and inspect formulas.

#### Acceptance Criteria

1. THE SYSTEM SHALL render the sheet in a green-phosphor CRT-style grid frame with column headers A through IV and 1-based row numbers.
2. WHEN a cell is selected, THE SYSTEM SHALL display the decompiled formula string in a formula bar, or the formatted value if no formula is present.
3. THE SYSTEM SHALL apply the format byte to produce formatted cell display values: fixed-decimal, scientific, currency, percent, comma-separated, date (D-MMM-YY, D-MMM, MMM-YY, MM/DD/YY, MM/DD), and time (HH:MM:SS AM/PM, HH:MM AM/PM, HH:MM:SS 24h, HH:MM 24h).
4. THE SYSTEM SHALL respect column widths from COLW1 records when rendering the grid.

---

### Requirement 13: Table Viewer

**User Story:** As a researcher with a dBASE DBF file, I want to view the table data with typed columns, so that I can inspect all records including deleted ones.

#### Acceptance Criteria

1. THE SYSTEM SHALL render the table in a dBASE dot-prompt-style browse frame with column headers derived from field names and types.
2. THE SYSTEM SHALL render logically-deleted records with a strikethrough style to distinguish them from live records.
3. THE SYSTEM SHALL provide a toggle control to show or hide deleted records; WHILE deleted records are hidden, THE SYSTEM SHALL retain them in the Specimen payload.

---

### Requirement 14: Document Viewer

**User Story:** As a user viewing a WordStar document, I want to see the text with its original formatting in a period-correct frame, so that I can read the document as intended.

#### Acceptance Criteria

1. THE SYSTEM SHALL render bold, italic, underline, strikethrough, superscript, and subscript runs using the corresponding HTML or CSS styles.
2. THE SYSTEM SHALL render page break blocks as visible horizontal separators in the document view.
3. THE SYSTEM SHALL render WordStar documents inside a fan-fold dot-matrix-paper-style frame.

---

### Requirement 15: Export — PNG

**User Story:** As a user who has decoded an image, I want to export it as a PNG, so that any modern application can open it.

#### Acceptance Criteria

1. WHEN exporting an image Specimen to PNG, THE SYSTEM SHALL produce a PNG file whose pixel values are identical to those in the decoded Specimen payload, with no colour-space conversion or lossy compression.
2. THE SYSTEM SHALL write the PNG file entirely in the browser using the Canvas API or a pure-JS encoder, with no server request.

---

### Requirement 16: Export — CSV

**User Story:** As a user who has decoded a sheet or table, I want to export it as a CSV file, so that I can open it in a spreadsheet application.

#### Acceptance Criteria

1. WHEN exporting a sheet or table Specimen to CSV, THE SYSTEM SHALL produce an RFC 4180-compliant CSV file containing every cell's display value.
2. THE SYSTEM SHALL ensure that the CSV round-trip property holds: parsing the exported CSV back to cell text produces the same cell strings that were exported.

---

### Requirement 17: Export — XLSX

**User Story:** As a user who has decoded a sheet or table, I want to export it as an XLSX file, so that I can open it in Excel or a compatible application.

#### Acceptance Criteria

1. WHEN exporting a sheet Specimen to XLSX, THE SYSTEM SHALL write cell values and, where available, formulas translated from Lotus 1-2-3 syntax to Excel syntax.
2. WHERE a Lotus formula contains a function that has no direct Excel equivalent, THE SYSTEM SHALL store that cell's cached numeric value instead and add a warning.
3. WHEN exporting a table Specimen to XLSX, THE SYSTEM SHALL write values only, without formulas.
4. THE SYSTEM SHALL produce a valid ZIP archive (using fflate) whose sheet XML document contains every cell from the Specimen.

---

### Requirement 18: Export — JSON

**User Story:** As a developer working with decoded sheet or table data, I want to export it as JSON, so that I can process it programmatically.

#### Acceptance Criteria

1. WHEN exporting a sheet or table Specimen to JSON, THE SYSTEM SHALL produce a JSON array where each element represents one record or row.
2. THE SYSTEM SHALL encode date values as ISO 8601 date strings (YYYY-MM-DD) in the JSON output.

---

### Requirement 19: Export — Markdown, HTML, and Plain Text

**User Story:** As a user who has decoded a WordStar document, I want to export it to Markdown, HTML, and plain text, so that I can read or publish it in a modern context.

#### Acceptance Criteria

1. WHEN exporting a document Specimen to Markdown, THE SYSTEM SHALL represent bold, italic, underline, and strikethrough spans using standard Markdown syntax.
2. WHEN exporting a document Specimen to HTML, THE SYSTEM SHALL represent bold, italic, underline, and strikethrough spans using semantic HTML tags (`<strong>`, `<em>`, `<u>`, `<s>`).
3. WHEN exporting a document Specimen to plain text, THE SYSTEM SHALL output the text content of all runs with no formatting markup and page breaks represented as a sequence of newline characters.

---

### Requirement 20: Built-in Sample Specimens

**User Story:** As a first-time visitor to Exhume, I want to try the application without owning a legacy file, so that I can explore its features immediately.

#### Acceptance Criteria

1. THE SYSTEM SHALL ship one built-in sample specimen for each of the six supported formats: MacPaint, PCX, IFF ILBM, Lotus WK1, dBASE DBF, and WordStar.
2. THE SYSTEM SHALL make each sample openable from the Graveyard without requiring a file upload.
3. THE SYSTEM SHALL generate all sample files from each format's `encode` function by running `npm run samples`; sample files SHALL be original content created for this project.
4. WHEN a sample is loaded, THE SYSTEM SHALL decode it successfully with no ExhumeError and display the full Autopsy with no annotation gaps.

---

### Requirement 21: Privacy and Offline Operation

**User Story:** As a user with privacy concerns, I want the application to work entirely in my browser without sending my file data anywhere, so that I can trust the application with sensitive documents.

#### Acceptance Criteria

1. THE SYSTEM SHALL perform all file identification, decoding, and export entirely within the browser tab, making no network requests that carry any part of a user's file data.
2. THE SYSTEM SHALL function fully offline after the initial page load, using a service worker or equivalent static-caching mechanism.
3. THE SYSTEM SHALL display a persistent, visible statement on the page that files are decoded locally on the user's device.

---

### Requirement 22: Accessibility

**User Story:** As a user who relies on a keyboard or screen reader, I want the application to be fully keyboard-navigable with sufficient contrast and live region announcements, so that I can use it without a pointer device.

#### Acceptance Criteria

1. THE SYSTEM SHALL make the file drop zone and each format tombstone reachable and activatable by keyboard alone.
2. THE SYSTEM SHALL display a visible focus indicator using the `--ember` accent colour on every interactive element.
3. THE SYSTEM SHALL ensure a minimum contrast ratio of 4.5:1 for all text elements.
4. THE SYSTEM SHALL provide `aria-live` region announcements for state changes: file is being decoded ("exhuming"), decoding succeeded ("done"), and decoding failed (error message).
5. THE SYSTEM SHALL ensure that no information in the Autopsy is conveyed by colour alone; every annotation span SHALL also carry a text label.

---

### Requirement 23: Exhume-MCP Server

**User Story:** As an AI agent or developer working on a format decoder, I want a stdio MCP server that exposes the decoders as tools, so that I can inspect binary fixtures programmatically without guessing at byte values.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide a Node.js stdio MCP server at `mcp/server.mjs` that conforms to the Model Context Protocol.
2. THE SYSTEM SHALL expose these four tools: `identify` (returns confidence scores from every FormatModule for a given file), `hexdump` (returns hex and ASCII representation of a specified byte range), `autopsy` (returns the annotation tree as JSON for a decoded file), `decode` (returns the full Specimen as JSON including payload, warnings, and meta).
3. THE SYSTEM SHALL implement all four tools by importing the compiled core library and calling the same `detect` and `decode` functions used by the browser app; it SHALL NOT re-implement any format logic.
4. WHEN the MCP server is asked to decode a file that returns an ExhumeError, THE SYSTEM SHALL return a structured error response rather than crashing the server process.
