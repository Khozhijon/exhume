# MacPaint (.mac, .pntg, .pnt) 1984-1988, Apple Macintosh
Source: Apple Technical Note PT24 "MacPaint Document Format" (TN #86), Inside Macintosh (PackBits).
All multi-byte integers are **big-endian**.

## Optional MacBinary wrapper (128 bytes)
Files that left a Mac often start with a MacBinary header. Detect it when: byte 0 = 0x00, byte 1 (file
name length) is 1..63, bytes 65..68 = `PNTG` (file type), byte 74 = 0, byte 82 = 0. Bytes 69..72 are the
creator (`MPNT`), bytes 83..86 the data fork length (u32). Skip the 128 bytes and decode the data fork.

## Document header (512 bytes)
| offset | size | field |
|---|---|---|
| 0 | 4 | version (u32): 0 = ignore patterns, 2 = patterns valid; other values: warn, continue |
| 4 | 304 | 38 brush patterns, 8 bytes each (8x8, 1 bit per pixel) |
| 308 | 204 | padding (zero) |

## Bitmap
Fixed size **576 x 720**, 1 bit per pixel, MSB is the leftmost pixel, **1 = black, 0 = white**.
72 bytes per row, 720 rows, each row PackBits-compressed (51,840 bytes uncompressed).

## PackBits
Read a signed byte `n`:
- `0..127`: copy the next `n+1` bytes literally.
- `-127..-1`: repeat the next single byte `1-n` times (2..128).
- `-128` (0x80): no-op, skip.
Canonical encoders compress row by row (a run never crosses a row). Decoders must treat the data as one
stream and stop at 51,840 output bytes. If input ends early: fill the rest with white and add a warning.
Trailing bytes after the last row: annotate as "slack", no warning.

## Payload model
`{ kind:"image", width:576, height:720, bitsPerPixel:1, palette:[[255,255,255],[0,0,0]], pixels: Uint8Array(576*720) of 0|1, patterns: Uint8Array[38] }`
