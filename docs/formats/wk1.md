# Lotus 1-2-3 worksheet (.wks, .wk1) 1983-c.1995, Lotus Development (releases 1A and 2.x)
Source: "Lotus File Formats for 1-2-3, Symphony & Jazz" (Lotus Books, 1986) and the Lotus
"Worksheet File Format" (WSFF) technical note. Integers are **little-endian**; numbers are IEEE 754
doubles. Text is LICS; treat bytes < 0x80 as ASCII and bytes >= 0x80 as ISO 8859-1 with one warning.

## Record stream
The file is a sequence of records: `type` (u16), `length` (u16), then `length` bytes.
First record must be BOF. Unknown types are annotated by number and skipped (no warning).

| type | name | body |
|---|---|---|
| 0x0000 | BOF | version (u16): 0x0404 = 1-2-3 1A (.wks), 0x0405 = Symphony, 0x0406 = 1-2-3 2.x (.wk1) |
| 0x0001 | EOF | empty; stop |
| 0x0006 | RANGE | startCol, startRow, endCol, endRow (u16 each): the used range |
| 0x0008 | COLW1 | col (u16), width in characters (u8) |
| 0x000B | NAME | 16-byte NUL-padded name, startCol, startRow, endCol, endRow (u16) |
| 0x000C | BLANK | fmt (u8), col (u16), row (u16) |
| 0x000D | INTEGER | fmt, col, row, value (i16) |
| 0x000E | NUMBER | fmt, col, row, value (f64) |
| 0x000F | LABEL | fmt, col, row, NUL-terminated string; first character is the alignment prefix |
| 0x0010 | FORMULA | fmt, col, row, cached value (f64), formulaLength (u16), bytecode |
| 0x0033 | STRING | fmt, col, row, NUL-terminated string: the text value of the preceding string formula |

Label prefixes: `'` left, `"` right, `^` centre, `\` repeat the rest across the cell. Strip the prefix
from the value and keep it as `align`.

## Format byte
bit 7 = protected. bits 4-6 = type, bits 0-3 = decimal places (0..15):
0 fixed, 1 scientific, 2 currency, 3 percent, 4 comma, 7 special. For special the low nibble means:
0 `+/-` bar, 1 general, 2 date D-MMM-YY, 3 date D-MMM, 4 date MMM-YY, 5 text (show formula),
6 hidden, 7 time HH:MM:SS AM/PM, 8 time HH:MM AM/PM, 9 date MM/DD/YY (long intl), 10 date MM/DD,
11 time HH:MM:SS (24h), 12 time HH:MM (24h), 15 default.
Date serials count days with 1 = 1 January 1900 and the famous non-existent 29 February 1900 (serial
60). Convert: for serial >= 61, date = 1899-12-30 + serial days; for serial < 60, 1899-12-31 + serial.

## Formula bytecode (reverse Polish)
Decompile to 1-2-3 text (`@SUM(B2..B13)*1.1`) and keep the cached value. If any opcode is unknown,
keep the value, set `formula: null`, and add a warning; never guess.
| opcode | meaning | operands |
|---|---|---|
| 0x00 | number constant | f64 |
| 0x01 | cell reference | col (u16), row (u16) |
| 0x02 | range reference | startCol, startRow, endCol, endRow (u16) |
| 0x03 | end of formula | |
| 0x04 | parentheses around top of stack | |
| 0x05 | integer constant | i16 |
| 0x06 | string constant | NUL-terminated |
| 0x08 | unary minus | |
| 0x09..0x0D | `+ - * / ^` | binary |
| 0x0E..0x13 | `= <> <= >= < >` | binary |
| 0x14, 0x15 | `#AND#`, `#OR#` | binary |
| 0x16 | `#NOT#` | unary |
| 0x17 | unary plus | |
| 0x1F.. | @functions | see table |

In a reference each u16 has bit 15 set when that coordinate is **relative**: the low 14 bits are then a
signed 14-bit offset from the formula's own cell (bit 13 is the sign). Bit 15 clear = absolute
coordinate (print with `$`).

Functions with a fixed number of arguments (opcode: name/args):
0x1F NA/0, 0x20 ERR/0, 0x21 ABS/1, 0x22 INT/1, 0x23 SQRT/1, 0x24 LOG/1, 0x25 LN/1, 0x26 PI/0,
0x27 SIN/1, 0x28 COS/1, 0x29 TAN/1, 0x2A ATAN2/2, 0x2B ATAN/1, 0x2C ASIN/1, 0x2D ACOS/1, 0x2E EXP/1,
0x2F MOD/2, 0x31 ISNA/1, 0x32 ISERR/1, 0x33 FALSE/0, 0x34 TRUE/0, 0x35 RAND/0, 0x36 DATE/3,
0x37 TODAY/0, 0x38 PMT/3, 0x39 PV/3, 0x3A FV/3, 0x3B IF/3, 0x3C DAY/1, 0x3D MONTH/1, 0x3E YEAR/1,
0x3F ROUND/2, 0x40 TIME/3, 0x41 HOUR/1, 0x42 MINUTE/1, 0x43 SECOND/1, 0x44 ISNUMBER/1,
0x45 ISSTRING/1, 0x46 LENGTH/1, 0x47 VALUE/1, 0x48 STRING/2, 0x49 MID/3, 0x4A CHAR/1, 0x4B CODE/1,
0x4C FIND/3, 0x4D DATEVALUE/1, 0x4E TIMEVALUE/1, 0x4F CELLPOINTER/1, 0x55 VLOOKUP/3, 0x56 NPV/2,
0x59 IRR/2, 0x5A HLOOKUP/3.
Functions with a variable number of arguments (opcode followed by one byte = argument count):
0x30 CHOOSE, 0x50 SUM, 0x51 AVG, 0x52 COUNT, 0x53 MIN, 0x54 MAX, 0x57 VAR, 0x58 STD.

## Payload model
`{ kind:"sheet", version:"1A"|"2"|"symphony", range?, columnWidths: Record<number,number>, names:[{name,range}], cells:[{col,row,type:"blank"|"integer"|"number"|"label"|"formula", value:number|string|null, formula?:string|null, align?, format:{type,decimals,protected}}] }`
Cells are sorted by row, then column. Limits: 256 columns (A..IV), 8192 rows (2.x), 2048 rows (1A).
