Most of the groundwork exists. Your job is the data samples and the generator script.
- `scripts/samples/images.mjs` already exports `ghostMac()`, `pumpkinPcx()`, `moonIff()` (ImagePayload
  models). Do not change it.
- Create `scripts/samples/data.mjs` exporting `budgetWk1()` (SheetPayload), `residentDbf()` (TablePayload)
  and `letterWs()` (DocumentPayload) with the content described in `docs/samples.md` (read it). The models
  must obey each encoder's valid-model rules, which are documented at the top of
  `src/formats/wk1/encode.ts`, `src/formats/dbf/model.ts` and `src/formats/wordstar/model.ts`: read those
  three headers first. WK1 formulas are written in the decompiler's canonical text (no leading `+`,
  `@SUM(B4..D4)`); cached `value`s of formula cells must be the numbers the formulas really produce
  (compute them in the script, do not type them). WordStar text is printable ASCII only.
  The letter is original writing, about 350 words, warm and a little eerie, dated 31 October 1986,
  from someone leaving their files "for whoever opens this"; it must use bold, underline, italic and
  one superscript, a `.PA` page break, a header and a footer containing `#` for the page number.
- Create `scripts/gen-samples.mjs` (Node ESM, deterministic). It imports the compiled modules from
  `../mcp/dist/formats/<id>/index.js` (named exports `macpaint`, `pcx`, `ilbm`, `wk1`, `dbf`,
  `wordstar`), `exhume` from `../mcp/dist/core/registry.js` and `coverage` from
  `../mcp/dist/core/annotations.js` (`npm run samples` already runs `build:core` first).
  For each of the six samples: `bytes = module.encode(model)`; then prove it before writing anything:
  `exhume(bytes, file)` must pick the same module, `specimen.payload` must deep-equal the model
  (`assert.deepStrictEqual`), `specimen.warnings` must be empty and `coverage(specimen.annotations,
  bytes.length).exact` must be true. Throw with a clear message otherwise.
  Then write `public/samples/<FILE>`, `public/samples/index.json` (`[{ file, formatId, title, blurb, bytes }]`)
  and regenerate `src/samples/data.ts`: keep the exact header comment, `SampleSpecimen` interface and
  `export const samples: SampleSpecimen[]` shape that file has now, filling in
  `{ file, formatId, title, blurb, base64 }` for the six samples in this order:
  GHOST.MAC, PUMPKIN.PCX, MOON.IFF, BUDGET87.WK1, RESIDENT.DBF, LETTER.WS. `title` is a short human
  title ("A ghost, drawn in 1-bit"), `blurb` one sentence.
- Run it with `npm run samples`. Then use the exhume MCP tools (`identify`, `autopsy`, `decode`) on two of
  the files in `public/samples/` to double-check what a user would see, and mention what they showed.
- Add `src/samples/samples.test.ts`: decode each embedded sample with `exhume` (from
  `../core/registry.js`, bytes via `Uint8Array.from(atob(base64), c => c.charCodeAt(0))`) and assert a
  few known values: the right format id, zero warnings, GHOST.MAC is 576x720, the Q1 total formula of
  the Rent row and its value, the NAME of record 3, two deleted records, the first bold run of the
  letter.
- Touch only: `scripts/samples/data.mjs`, `scripts/gen-samples.mjs`, `public/samples/*`,
  `src/samples/data.ts`, `src/samples/samples.test.ts` and the task checkbox.
Check with ONE command: `npm run -s samples && npm run -s typecheck && npx vitest run src/samples 2>&1 | tail -20`.
