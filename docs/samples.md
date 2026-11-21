# Built-in sample specimens (original content made for this project)

`npm run samples` writes these six files to `public/samples/` with the project's own encoders, plus
`public/samples/index.json` (`[{ file, formatId, title, blurb }]`). Everything is drawn or written by
the generator script: no third-party files, fonts or images. Text in pictures uses the small 5x7
bitmap font defined in the generator. Output must be deterministic (no dates, no randomness without a
fixed seed) so the files do not change between runs.

| file | format | what it is |
|---|---|---|
| `GHOST.MAC` | MacPaint | 576x720, 1-bit. A night scene drawn with 8x8 dither patterns: a round moon, a hill, three tombstones and one ghost with two eyes. Lettering on the centre stone: `R.I.P.` / `MACPAINT` / `1984-1988`. Caption at the bottom: `DRAWN FOR EXHUME`. Use at least four different fill patterns so the 1-bit dithering is visible. |
| `PUMPKIN.PCX` | PCX, 8 bpp x 1 plane, 320x200, version 5 with VGA palette | A jack-o'-lantern: orange ribbed pumpkin on a dark purple-to-black gradient, glowing yellow eyes and mouth, green stem. The palette is a designed 256-colour ramp (black-purple, orange, yellow, green). |
| `MOON.IFF` | ILBM, 5 bitplanes (32 colours), 320x256, ByteRun1 | An Amiga-style sunset: horizontal bands of sky colour, a large moon, a bare tree silhouette and a fence. Chunks: BMHD, CMAP, CAMG (0), BODY. |
| `BUDGET87.WK1` | Lotus 1-2-3 2.x | "HOUSEHOLD BUDGET 1987". Row 1 title, row 3 headers `Item, Jan, Feb, Mar, Q1 Total, Average`. Eight rows of items (Rent, Groceries, Electricity, Telephone, Car, Insurance, Floppy disks, Savings) with integer and decimal numbers, `@SUM` and `@AVG` formulas per row, a totals row of `@SUM` down each column, an `@IF(total>limit,1,0)` over-budget flag, one date cell (serial for 31-Oct-1987, format D-MMM-YY), currency and fixed formats, centred and right-aligned labels, a named range `TOTALS`, column widths. |
| `RESIDENT.DBF` | dBASE III+ (no memo) | The graveyard register: fields `NAME C(24)`, `BORN N(4,0)`, `DIED N(4,0)`, `PLOT C(4)`, `MOURNED L`, `BURIED D`, `SIZE_KB N(8,2)`. Twelve residents that are dead technologies (VisiCalc 1979-1985, WordStar 1978-1992, MacPaint 1984-1988, Lotus 1-2-3 1983-2013, dBASE II 1980-1985, PC Paintbrush 1984-1994, Deluxe Paint 1985-1995, CP/M 1974-1983, ...). Two records are flagged deleted so the viewer has rows to recover. |
| `LETTER.WS` | WordStar 4.0 | A one-and-a-half page letter dated 31 October 1986 from someone leaving their files "for whoever opens this". Uses `.HE`, `.FO`, `.OP`, `.PA`, bold, underline, italic, a superscript, soft carriage returns from word wrap at column 65, soft spaces, word-final high bits, and CP/M `^Z` padding to a 128-byte boundary. |

Each sample is also used as an example-test fixture: decode it, check a few known values (a pixel that
must be black, the Q1 total of Rent, the name of record 3, the first bold run).
