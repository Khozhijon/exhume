# Devpost submission text (draft, to paste into the form)

**Project name:** Exhume

**Tagline:** Raise your dead files: MacPaint, Lotus 1-2-3, dBASE, WordStar and more, decoded in your browser, byte by byte.

**Category:** Resurrection

**Links:** live app (GitHub Pages), repository (public, MIT), video (YouTube): filled in after publishing.

**Built with:** kiro, typescript, react, vite, vitest, fast-check, model-context-protocol, fflate, github-pages, claude-code

---

## Inspiration

Files do not die when the disk fails. They die when the last program that understood them stops
running. A drawing made in MacPaint, a family budget in Lotus 1-2-3, a club's membership list in
dBASE, a letter typed in WordStar: the bytes survive on old disks and in old backups, and nothing on a
modern computer opens them. The converters that exist mostly ask you to upload private files to a
server, and none of them show their work, so you cannot tell what was lost on the way.

Kiroween's Resurrection category asks for dead technology brought back to life. Dead file formats are
the dead technology most people actually own.

## What it does

Exhume is a static web app. Drop a file on the page and it:

1. **Identifies the format from the bytes**, not the file name.
2. **Decodes it in the browser tab.** Nothing is uploaded; there is no server. It works offline.
3. **Shows it in a frame from its own era**: a System 1 window for MacPaint, a green-phosphor
   1-2-3 screen with the control panel and cell pointer, a dBASE `BROWSE` screen, fan-fold paper for
   WordStar.
4. **Explains every byte.** The Autopsy is an annotated hex view: each byte is coloured by the
   structure it belongs to, next to a tree of everything the decoder found. Select a byte to see what
   it means, select a structure to see its bytes.
5. **Tells the truth about damage.** A truncated or corrupted file still opens; the Coroner's report
   lists exactly what could not be recovered. Exhume never invents content.
6. **Reincarnates it**: PNG for pictures; CSV, JSON and XLSX for worksheets and tables; Markdown, HTML
   and text for documents. Lotus formulas are decompiled from bytecode (`@SUM(B4..D4)`), translated to
   Excel (`=SUM(B4:D4)`) and written into the workbook, so the exported sheet still calculates.

Six formats in this version: MacPaint, PC Paintbrush PCX, Amiga IFF ILBM (including EHB and HAM6),
Lotus 1-2-3 WKS/WK1, dBASE III/IV (including rows marked deleted) and WordStar 3.x/4.0. Six built-in
sample files, all original works drawn and written for this project, let you try it without owning an
old disk.

## How we built it

Spec first, with **Kiro**.

- **Spec.** From a two-page brief and byte-layout notes, one Kiro spec-mode session produced
  `requirements.md` (23 requirements with EARS acceptance criteria), `design.md` (architecture, core
  types, 12 numbered correctness properties, recorded decisions) and `tasks.md` (26 tasks, each traced
  to requirements, property tests as sub-tasks). That spec was the contract for all the code. Five
  format modules were later written in parallel by agents that never saw each other's work, and they
  fit together on the first try because they were written against the same design.
- **Steering.** Five documents: the product's promises (private, honest, never crashes, faithful),
  tech rules ("no format libraries"), structure, the format-module contract (file-matched to
  `src/formats/**`) and UI rules (file-matched to `src/ui/**`).
- **Agent hooks.** A `PreToolUse` shell guard (no git writes, downloads, installers or unlisted
  dependencies) made it safe to trust the shell in headless runs: 110 runs. Two `PostFileSave` hooks
  ran on every file an agent saved: one checks the product promises in code (no network calls, no DOM
  in decoders, no raw `DataView` outside the annotating reader, no UTF-8 decoding of legacy text): 74
  runs; one runs the tests of the folder that was touched: 25 runs. Plus a `SessionStart` brief and a
  `Stop` type-check.
- **MCP.** The project ships its own MCP server, `exhume-mcp`, exposing its decoders as tools
  (`identify`, `hexdump`, `autopsy`, `decode`), so an agent working on a binary format can look
  inside a file instead of guessing. Kiro used it to check the sample files it generated, and as a
  reviewer to confirm in the bytes what the format notes promise.
- **Custom agents.** `gravedigger` implements one spec task; `coroner` reviews against the spec and
  may not edit source.
- **Property-based tests.** Every format passes the same four properties (fast-check): round trip
  through its own encoder; arbitrary and mutated bytes never cause anything but a clean error;
  annotations tile an encoded file exactly, every byte explained once; any truncated prefix decodes
  with a warning or fails cleanly. Plus codec, CSV, XLSX and Lotus-formula round trips. About 400
  tests in total.
- **Kiro CLI, headless.** Every session is a prompt file in and a transcript out, with its credit
  cost, and a review next to it. All of it is in the repository.

**Honest division of labour.** This was built on Kiro's free tier (50 credits a month), which does
not stretch to 26 implementation tasks. Kiro wrote the spec and implemented the scaffold,
`ByteReader`/`ByteWriter`, PackBits, the first MCP server, the samples generator, the Table and
Document viewers and the offline/accessibility pass, and reviewed a module as the `coroner`.
**Claude Code** (Anthropic) wrote the steering, hooks, agent definitions and format notes,
orchestrated and reviewed every Kiro run, and implemented the rest against Kiro's spec: the six format
modules, the export layer, the app shell, the sheet and image viewers and the Autopsy.
`docs/KIRO.md` in the repository has the full account.

Stack: TypeScript (strict), React, Vite, Vitest, fast-check. No format libraries: every decoder is
written from the published format descriptions. Runtime dependencies: React and `fflate`.

## Challenges we ran into

- **The cheapest model was the most expensive.** The first four tasks went to the model with the
  lowest credit multiplier. It needed four to ten times as many steps, re-read files and looped on
  its own failing tests, and every step re-sends the context: 4.6, 8.9, 3.5 and 6.6 credits. A
  stronger model at eight times the multiplier then did comparable tasks for under one credit each.
  Cost is steps times context, not the price tag.
- **Agents typing data from memory.** One session tried to write four 128-entry code page tables by
  recall and got them wrong. Lookup tables are generated from the Unicode mapping data now.
- **Review caught what the agent's own checks did not**: 32-bit reads that came back negative, a
  string read that ran one byte past the buffer, a server importing a file that did not exist. Each
  has a review note and a regression test.
- **Hooks that never fired.** The first file-save matchers were anchored to relative paths while Kiro
  passes absolute ones. The transcripts showed zero runs; fixed, then 74.
- **Round trips force precision.** "decode(encode(m)) equals m" sounds simple until it has to hold
  for palettes of any length, WordStar soft line breaks and Lotus formula parentheses.

## Accomplishments that we're proud of

- The Autopsy is not a second parser. Decoders can only read through a reader that records what each
  field is, so the explanation and the decoding cannot drift apart, and a property test proves that
  every byte of an encoded file is explained exactly once.
- Lotus formulas come back to life: bytecode to 1-2-3 text to Excel, and the workbook recalculates.
- Rows that someone "deleted" in dBASE in 1987 are still in the file, and Exhume shows them.
- It never uploads anything, and a hook enforces that in the code.

## What we learned

A spec is worth more than it costs. Steering only works when a hook enforces it. An MCP server for
your own domain changes what an agent can verify. Headless agent runs with saved transcripts make AI
work reviewable, and the reviews are where the quality came from.

## What's next for Exhume

More residents for the graveyard (WordPerfect 5.1, Microsoft Works, GEM IMG, AppleWorks), dBASE memo
files, a corpus test against real files from public archives, and packaging the format-module
contract, steering and MCP server as a Kiro Power so that adding a dead format is one request.

---

## Short "How was Kiro used?" field (if the form has one)

Spec-driven development in Kiro CLI: one spec-mode session produced requirements (23, EARS), design
(12 correctness properties) and tasks (26). Steering (5 docs, 2 file-matched) carried the product
promises; hooks enforced them (PreToolUse shell guard 110 runs, PostFileSave promise guard 74 runs,
PostFileSave test runner 25 runs, SessionStart brief, Stop type-check). The project ships its own MCP
server (exhume-mcp: identify, hexdump, autopsy, decode) which Kiro used to inspect binary files. Two
custom agents: gravedigger (implements one task) and coroner (read-only reviewer). Kiro implemented
the scaffold, core reader/writer, PackBits, samples generator, two viewers, the offline/accessibility
pass and a review; Claude Code orchestrated, reviewed and implemented the rest against Kiro's spec
(free tier, 50 credits). Full transcripts with per-session cost: docs/kiro-sessions/. Account:
docs/KIRO.md.
