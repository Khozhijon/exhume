# dBASE table (.dbf) 1980-c.1995, Ashton-Tate dBASE II/III/III+/IV
Source: dBASE III PLUS / dBASE IV file structure appendices. Integers are **little-endian**.
Text is CP437 unless the language driver byte says otherwise (0x01 CP437, 0x02 CP850, 0x03 CP1252;
anything else: assume CP437 and add a warning if any byte >= 0x80 is seen).

## Header (32 bytes)
| offset | size | field |
|---|---|---|
| 0 | 1 | version: 0x03 dBASE III, 0x83 III+ with memo (.dbt), 0x04 dBASE IV, 0x8B IV with memo. FoxPro (0x30, 0x31, 0xF5): decode what matches, add a warning |
| 1 | 3 | last update: YY (add 1900), MM, DD |
| 4 | 4 | record count (u32) |
| 8 | 2 | header length (u16) = 32 + 32 * fieldCount + 1 |
| 10 | 2 | record length (u16) = 1 + sum of field lengths |
| 12 | 20 | reserved; byte 29 = language driver id |

## Field descriptors (32 bytes each) until a 0x0D terminator byte
| offset | size | field |
|---|---|---|
| 0 | 11 | name, ASCII, NUL padded |
| 11 | 1 | type: `C` character, `N` numeric, `F` float, `L` logical, `D` date, `M` memo |
| 12 | 4 | reserved (in-memory address) |
| 16 | 1 | length |
| 17 | 1 | decimal count |
| 18 | 14 | reserved |

## Records (start at header length)
Each record: 1 flag byte (0x20 = live, 0x2A `*` = deleted) then the fields, fixed width, no separators.
- `C`: text padded with spaces on the right (trim right).
- `N`, `F`: ASCII number right-aligned, spaces = empty (null). Keep the exact text and a parsed number.
- `D`: `YYYYMMDD`, eight spaces = empty.
- `L`: `T t Y y` true, `F f N n` false, `?` or space = unknown (null).
- `M`: ten-digit block number into the .dbt file, which we do not have: value = null plus one warning
  for the table ("memo fields need the .dbt file").
The file usually ends with 0x1A. Deleted records are kept in the payload with `deleted: true` (the
viewer shows them struck through: recovering "deleted" rows is a feature).
If the record count in the header disagrees with the bytes actually present, decode the records that
exist and add a warning.

## Payload model
`{ kind:"table", fields:[{name,type,length,decimals}], records:[{deleted:boolean, values:(string|number|boolean|null)[]}], lastUpdate:"YYYY-MM-DD" }`
Dates are ISO strings `YYYY-MM-DD`.
