---
inclusion: fileMatch
fileMatchPattern: ["src/ui/**", "src/**/*.css", "index.html"]
---
# UI: a graveyard at night, not a haunted-house ride

- **Palette (CSS variables in `src/ui/theme.css`):** `--night:#0b0d12`, `--soil:#1a1410`,
  `--stone:#8a8f98`, `--bone:#e8e4d8`, `--moss:#6f8f5a`, `--ember:#ff7a1a` (the only accent),
  `--phosphor:#7dff9b` (CRT green), `--blood:#b3261e` (errors only).
- **Type:** headings in a serif with character (`"IM Fell English", "Iowan Old Style", Georgia, serif`),
  UI text in system sans, bytes and cells in `ui-monospace`. Fonts are bundled or system: no font CDN.
- **Motion:** slow and few. Fog drifts, a tombstone lifts when hovered, the specimen rises once.
  Everything respects `prefers-reduced-motion`.
- **Period frames:** each specimen kind renders inside a frame that recalls its era (System 1 window for
  MacPaint, green phosphor grid for Lotus 1-2-3, dBASE dot prompt browse table, fan-fold paper for
  WordStar). Frames are CSS only.
- **Pixels stay pixels:** images render to `<canvas>` with `image-rendering: pixelated`, integer zoom.
- **Accessibility:** keyboard reachable drop zone and tombstones, visible focus ring in `--ember`,
  contrast at least 4.5:1 for text, `aria-live` status for "exhuming"/"done"/errors, no information by
  colour alone in the Autopsy (spans also have labels).
- **Layout:** works from 360px wide. The Autopsy is a two-pane view (hex left, structure tree right)
  that stacks on narrow screens.
- **Copy:** follow the Voice section of product.md. Buttons are verbs: Exhume, Autopsy, Reincarnate.
