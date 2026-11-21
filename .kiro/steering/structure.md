---
inclusion: always
---
# Structure

```
src/
  core/            format-independent building blocks
    reader.ts        ByteReader: bounds-checked reads that record annotation spans
    writer.ts        ByteWriter: growable little/big-endian writer used by encoders
    types.ts         Specimen, Annotation, Warning, FormatModule, ExhumeError
    registry.ts      list of FormatModules, sniffing (detect) and dispatch
    packbits.ts      shared PackBits / ByteRun1 codec (MacPaint, ILBM)
  formats/
    <id>/            one folder per format: macpaint, pcx, ilbm, wk1, dbf, wordstar
      index.ts         exports the FormatModule
      decode.ts        bytes -> Specimen (records annotations and warnings)
      encode.ts        model -> bytes (used for samples and round-trip properties)
      *.test.ts, *.prop.test.ts
  export/          reincarnation: png.ts, csv.ts, json.ts, xlsx.ts, markdown.ts, html.ts
  ui/              React components: Graveyard, Viewer (per kind), Autopsy, ExportBar
  samples/         scripts and source data that build public/samples/*
mcp/               exhume-mcp stdio server (tools: identify, autopsy, decode, hexdump)
public/samples/    generated legacy files shipped with the app
docs/              brief, format notes, kiro-sessions/ (logs of Kiro runs)
.kiro/             specs, steering, hooks, agents, settings (never git-ignored)
```

## The one contract every format obeys

```ts
interface FormatModule {
  id: string;                 // "macpaint"
  name: string;               // "MacPaint"
  born: number; died: number; // years on the tombstone
  extensions: string[];       // [".mac", ".pntg", ".pnt"]
  kind: "image" | "sheet" | "table" | "document";
  epitaph: string;            // one line of history
  detect(bytes: Uint8Array, fileName?: string): number;   // confidence 0..1, must not throw
  decode(bytes: Uint8Array): Specimen;                    // throws only ExhumeError
  encode?(model: SpecimenPayload): Uint8Array;            // inverse of decode for valid models
}
```

- A `Specimen` carries `payload` (the content), `annotations` (byte spans for the Autopsy),
  `warnings` (what could not be recovered) and `meta` (dimensions, record counts, dates).
- Decoders read **only** through `ByteReader` so every field becomes an annotation for free.
- UI code never parses bytes. Format code never touches the DOM.
