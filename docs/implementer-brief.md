# Brief for an implementing agent (Claude Code subagents and Kiro agents alike)

You implement one slice of **Exhume** (legacy file formats decoded in the browser). The project is
spec-driven: the spec in `.kiro/specs/exhume-core/` (requirements.md, design.md, tasks.md) was written
by Kiro and is the contract.

Read first, in this order:
1. `.kiro/steering/product.md`, `tech.md`, `structure.md`, `formats.md` (short; rules + core API cheat sheet).
2. Your task block in `.kiro/specs/exhume-core/tasks.md` and the requirement(s) it references
   (grep `### Requirement N` in requirements.md; do not read the whole file).
3. The design.md section for your slice (grep its heading) and the "Correctness Properties" you must test.
4. For a format: `docs/formats/<id>.md` (the byte layout: follow it exactly).
5. The core you build on: `src/core/types.ts`, `reader.ts`, `writer.ts`, `limits.ts`, `packbits.ts`,
   `codepage.ts`, `annotations.ts`, `testing.ts`.

Rules:
- TypeScript strict, `noUncheckedIndexedAccess` is on. No `any`. Relative imports end in `.js`.
- Format code reads bytes **only through `ByteReader`** (use `r.mark()` for spans a codec consumed),
  never touches the DOM, never uses `TextDecoder`, `Buffer`, `fetch`. Files stay under ~300 lines.
- Damage becomes `warnings` and decoding continues; only an unusable file throws `ExhumeError`.
  Nothing else may ever be thrown from `decode`, and `detect` never throws. Check limits
  (`src/core/limits.ts`) before allocating from a length found in the file.
- Top-level annotations of a file produced by `encode()` must tile the file exactly: every byte in
  exactly one top-level span (group things: header, palette, body, trailer...). Keep the tree useful
  for a human: field names from the format notes, a `value` where it helps. Do not create one
  annotation per pixel or per byte; for big bodies annotate per row / per record (cap the children of
  one group at a few thousand).
- Any proper prefix of a valid file must decode with at least one warning or throw `ExhumeError`.
- Tests: `<id>.test.ts` (example tests incl. damaged inputs and every warning path) and
  `<id>.prop.test.ts` calling `formatProperties()` from `src/core/testing.ts` with a fast-check
  arbitrary of valid models, plus the slice-specific properties named in your task.
- Do NOT edit `src/core/*`, `src/formats/index.ts`, `package.json`, `.kiro/**` or other slices' folders.
  If the core lacks something, work around it locally and say so in your report. Do not install
  packages. Do not run git commands that change anything.
- Check with: `node_modules/.bin/tsc --noEmit` and `node_modules/.bin/vitest run src/<your folder>`
  (ignore lines starting with "ERROR: failed to copy trust settings": sandbox noise).

Finish with a report (max 25 lines): files written, test counts, decisions you made where the notes
were silent, anything that does not work or was not verified, anything the core should change.
