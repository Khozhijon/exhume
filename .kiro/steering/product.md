---
inclusion: always
---
# Product: Exhume

**Exhume raises dead file formats from the grave.** Drop a file that no modern app opens (a MacPaint
drawing, a Lotus 1-2-3 worksheet, a dBASE table, a WordStar letter, a PC Paintbrush or Amiga IFF picture)
and Exhume opens it in the browser, shows what is inside, explains its bytes, and exports it to a format
that will still open tomorrow.

Kiroween 2026 entry, category **Resurrection**.

## Who it is for
- Families and individuals with old disks, backups and archives they can no longer read.
- Archivists, librarians, journalists and researchers who meet legacy files without legacy software.
- Curious developers who want to see how a classic binary format is laid out.

## Promises (never break these)
1. **Private.** Files are decoded on the user's device. Nothing is uploaded. No analytics, no network
   calls with file data, no server.
2. **Honest.** Exhume never invents content. If bytes are damaged or a feature is unsupported it says so
   in a visible warning list ("what the coroner could not recover") and still shows everything it can.
3. **Never crashes on bad input.** Any byte sequence produces either a specimen or a clear error object.
4. **Faithful.** Pixels, cell values, field values and text come out exactly as stored. Round trips
   through our own encoders are lossless.

## The three rooms
- **Graveyard** (home): one tombstone per supported format with its years of life, a drop zone, and
  built-in sample specimens so the app can be tried without owning an old file.
- **Viewer**: the exhumed file rendered in a period-correct frame (1-bit Mac window, green-phosphor
  spreadsheet, dot-matrix page).
- **Autopsy**: an annotated hex view. Every decoded structure (header, record, run of compressed pixels)
  is a labelled, coloured span that links bytes to meaning.
- **Reincarnate** (export, available from Viewer): PNG for pictures, CSV/JSON/XLSX for tables and
  sheets, Markdown/HTML/plain text for documents.

## Voice
Dry, short, a little gothic. "Exhume", "specimen", "autopsy", "reincarnate", "epitaph". Never gore,
never jump scares, never jokes that hide information the user needs.
