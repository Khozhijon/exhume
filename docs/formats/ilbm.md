# IFF ILBM (.iff, .ilbm, .lbm) 1985-c.1996, Electronic Arts / Commodore Amiga (Deluxe Paint)
Source: "EA IFF 85" standard and the ILBM specification (Jerry Morrison, Electronic Arts, 1986).
All integers are **big-endian**.

## Container
`"FORM"` u32 size `"ILBM"`, then chunks: 4-byte id, u32 size, data, plus 1 pad byte if size is odd.
Unknown chunks are annotated and skipped. A FORM type of `"PBM "` (chunky Deluxe Paint PC variant) is
supported when 8 planes: BODY rows are bytes, one per pixel, row width padded to even.

## BMHD (20 bytes)
| offset | size | field |
|---|---|---|
| 0 | 2+2 | width, height (u16) |
| 4 | 2+2 | x, y origin (i16) |
| 8 | 1 | nPlanes (1..8, or 24) |
| 9 | 1 | masking: 0 none, 1 mask plane stored, 2 transparent colour, 3 lasso |
| 10 | 1 | compression: 0 none, 1 ByteRun1 |
| 11 | 1 | pad |
| 12 | 2 | transparentColor (u16) |
| 14 | 1+1 | xAspect, yAspect |
| 16 | 2+2 | pageWidth, pageHeight (i16) |

## CMAP
`size/3` RGB triples. If absent: greyscale ramp + warning.

## CAMG (4 bytes, optional)
Amiga viewport mode flags (u32): `0x0800` = HAM, `0x0080` = EHB (extra half-brite).

## BODY
Rows top to bottom. Each row holds `nPlanes` bit-plane rows (plus one mask plane row when masking = 1,
which is decoded and discarded). One plane row is `rowBytes = ((width + 15) >> 4) << 1` bytes.
With compression = 1 each plane row is compressed separately with ByteRun1, which is identical to
PackBits (see macpaint.md). Pixel value: bit from plane `p` becomes bit `p` of the index (plane 0 = LSB),
MSB of each byte is the leftmost pixel.

## Colour modes
- **Indexed** (1..8 planes): index into CMAP.
- **EHB** (6 planes, CAMG EHB or CMAP of 32 entries): indices 32..63 are colours 0..31 at half brightness.
- **HAM6** (6 planes, CAMG HAM): per pixel, top 2 bits select: 00 = palette colour (low 4 bits index),
  01 = keep previous colour but set blue, 10 = set red, 11 = set green, to `low4 * 17`. Each row
  starts from palette colour 0. Output is 24-bit.
- **24 planes**: direct RGB, planes 0..7 red LSB first, 8..15 green, 16..23 blue.
Missing BODY bytes: fill with index 0 and add a warning.

## Payload model
Same as PCX: `{ kind:"image", width, height, bitsPerPixel, palette?, pixels }`. EHB expands the
palette to 64 entries; HAM and 24-plane images are emitted as 24-bit.
