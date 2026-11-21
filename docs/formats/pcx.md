# PCX (.pcx) 1985-c.2000, ZSoft PC Paintbrush
Source: ZSoft PCX File Format Technical Reference Manual (1991). Integers are **little-endian**.

## Header (128 bytes)
| offset | size | field |
|---|---|---|
| 0 | 1 | manufacturer = 0x0A |
| 1 | 1 | version: 0 (2.5), 2 (2.8 with palette), 3 (2.8 no palette), 4 (Windows), 5 (3.0+) |
| 2 | 1 | encoding: 1 = RLE (0 = uncompressed, rare: support, warn) |
| 3 | 1 | bitsPerPixel per plane: 1, 2, 4 or 8 |
| 4 | 8 | xMin, yMin, xMax, yMax (u16 each). width = xMax-xMin+1, height = yMax-yMin+1 |
| 12 | 4 | hDpi, vDpi (u16) |
| 16 | 48 | 16-colour EGA palette, RGB triples |
| 64 | 1 | reserved (0) |
| 65 | 1 | nPlanes: 1, 3 or 4 |
| 66 | 2 | bytesPerLine per plane (u16, even) |
| 68 | 2 | paletteInfo: 1 = colour/BW, 2 = greyscale |
| 70 | 4 | hScreenSize, vScreenSize (u16) |
| 74 | 54 | filler (zero) |

## Pixel data (offset 128)
Each scanline is `nPlanes * bytesPerLine` bytes after decoding, planes stored one after another
(all of plane 0, then plane 1, ...). RLE: read byte `b`; if `(b & 0xC0) == 0xC0` then count = `b & 0x3F`
and the next byte is the value repeated `count` times; otherwise `b` is one literal byte. A literal value
>= 0xC0 must be written as a run of 1. Encoders break runs at scanline ends; decoders should tolerate
runs that cross a scanline. Padding bytes beyond `width` in each line are ignored.

## Supported layouts
| bitsPerPixel | nPlanes | meaning | colours from |
|---|---|---|---|
| 1 | 1 | monochrome | 0 = black, 1 = white (use header palette entries 0,1 if they differ) |
| 1 | 4 | 16-colour planar (EGA): pixel = bit from each plane, plane 0 = LSB | header palette |
| 4 | 1 | 16-colour packed, high nibble first | header palette |
| 8 | 1 | 256 colours | VGA palette at end of file, or greyscale if absent |
| 8 | 3 | 24-bit RGB, planes R, G, B | direct |
| 2 | 1 | CGA 4-colour | fixed CGA palette 1 high intensity (black, cyan, magenta, white) + warning |
Anything else: `ExhumeError("unsupported PCX layout")`.

## VGA palette
If version = 5 and 8 bpp x 1 plane: the byte at `fileLength - 769` must be 0x0C, followed by 256 RGB
triples. If missing: greyscale ramp + warning.

## Payload model
`{ kind:"image", width, height, bitsPerPixel: 1|4|8|24, palette?: [r,g,b][], pixels: Uint8Array }`
Indexed images: one byte per pixel (palette index). 24-bit: 3 bytes per pixel RGB, no palette.
