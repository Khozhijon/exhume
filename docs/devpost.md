# Devpost submission text (draft, to paste into the form)

**Project name:** Exhume

**Tagline:** Raise your dead files: MacPaint, Lotus 1-2-3, dBASE, WordStar and more, decoded in your browser, byte by byte.

**Category:** Resurrection

**Links:** live app https://khozhijon.github.io/exhume/ · repository (public, MIT) https://github.com/Khozhijon/exhume · video https://youtu.be/AJCUTo_KywI

**Built with:** kiro, kiro-cli, typescript, react, vite, vitest, fast-check, model-context-protocol, fflate, node.js, github-actions, github-pages

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

## How we built it: how Kiro was used

**At a glance.** Kiro CLI 3.5.0, headless, on the free tier: 10 working sessions, about 44 of the
month's 50 credits, every transcript and its cost in `docs/kiro-sessions/`. The `.kiro/` directory at
the root of the repository holds one spec (23 requirements, 12 correctness properties, 26 tasks), 5
steering documents, 6 hooks, the registration of the project's own MCP server and 2 custom agents.

**Which Kiro.** CLI only, headless (`kiro-cli chat --no-interactive`), driven by
`scripts/kiro-task.sh`. Each session is a prompt file in and a transcript with its credit cost out,
with a written review next to it, so every piece of Kiro's work can be read, checked and rerun. The
spec UI's Correctness view is IDE-only, so the link from requirement to property to test is kept by
convention instead: property numbers in `design.md` are the numbers in the test titles.

**Spec-driven development.** From a two-page brief and byte-layout notes, one spec-mode session (9.8
credits, a fifth of the month) wrote `.kiro/specs/exhume-core/`:
- `requirements.md`: 23 requirements with EARS acceptance criteria, one per format, down to the bytes
  ("IF the compressed input is exhausted before 51,840 bytes are produced, THEN THE SYSTEM SHALL fill
  remaining pixels with white and add a warning").
- `design.md`: architecture, core types, the `ByteReader`/`ByteWriter` interfaces, the Lotus formula
  decompiler, and 12 numbered correctness properties, each ending in "Validates: Requirements x.y".
- `tasks.md`: 26 tasks, each traced to requirements, with property tests as sub-tasks right after the
  code they test. All 26 are checked off.

Compared with prompting directly: five format modules were later written in parallel by separate
agents that never saw each other's code, and they fit together on the first try because they were
written against the same `design.md`. The sessions that went wrong went wrong on execution, never on
what we were building.

**Steering.** Five documents: the four promises (private, honest, never crashes, faithful) in
`product.md`; stack and "no format libraries" in `tech.md`; layout and the `FormatModule` contract in
`structure.md`; and two file-matched documents, `formats.md` (for `src/formats/**`, `src/core/**`,
`mcp/**`) and `ui.md` (for `src/ui/**`). The strategy that made the biggest difference: write each
promise as a testable rule and enforce it twice, once in steering and once in a hook. "Decoders read
only through `ByteReader`" is one line of steering, and it is why the Autopsy view exists without a
second parser.

**Agent hooks.** Counts are from the transcripts.
- `PreToolUse` shell guard: refuses git writes, downloads, installers and unlisted dependencies, so
  the shell could be trusted in headless runs (110 runs).
- `PostFileSave` promise guard: no network calls in app code, no DOM in decoders, no raw `DataView`
  outside the reader, no UTF-8 decoding of legacy text; violations go straight back to the agent (74
  runs).
- `PostFileSave` test runner: runs the tests of the folder that was touched (25 runs).
- `SessionStart` brief with spec progress and the next open task (7 runs); `Stop` type-check before
  the agent may finish (5 runs); a `PostFileCreate` checklist for new format modules (0 runs: Kiro
  never created one).

**MCP.** The project ships its own MCP server, `exhume-mcp` (registered in
`.kiro/settings/mcp.json`), which exposes the project's decoders as tools: `identify`, `hexdump`,
`autopsy` and `decode`. An agent cannot `cat` a binary file; without the server it guesses, with it,
it looks. Kiro used it after generating the sample files, to check `GHOST.MAC` and `RESIDENT.DBF` the
way a user would see them, and as the reviewer agent, to confirm in the bytes of `LETTER.WS` a
word-final high bit, a soft carriage return (`8D 0A`) and the `^Z` padding.

**Custom agents** (in Kiro CLI). `gravedigger` implements exactly one spec task and marks it done;
`coroner` reviews against the spec and the properties and may not edit `src/`. Its review of the
WordStar module (1.0 credit) is `docs/reviews/coroner-wordstar.md`.

**Property-based testing.** The spec names the properties; the tests are fast-check. Every format
passes the same four from one shared harness: round trip through its own encoder; arbitrary and
mutated bytes never cause anything but a clean error; annotations tile a file exactly, every byte
explained once; any truncated prefix decodes with a warning or fails cleanly. They caught what example
tests would not have: Property 8 (Lotus formulas decompile and compile back to the same text) failed
on run 368 of one execution, and fast-check shrank the input to ten bytes, a range whose corners were
stored out of order. The fix and the shrunk counterexample are in the repository. About 400 tests in
total.

**Kiro powers.** Not used in this build. Packaging the format contract, steering and MCP server as a
power is the next step (see What's next).

**What Kiro wrote.** The spec (`.kiro/specs/exhume-core/`); the scaffold (`src/core/types.ts`,
`registry.ts`, `limits.ts`, the app entry); `src/core/reader.ts` and `writer.ts` with their tests;
`src/core/packbits.ts` with its property tests; the first MCP server (`mcp/lib.mjs`, finished in review); the samples
generator (`scripts/gen-samples.mjs`, `scripts/samples/`, `src/samples/`); the Table and Document
viewers (`src/ui/viewers/TableViewer.tsx`, `DocumentViewer.tsx`); the first service worker, manifest
and accessibility pass; and the WordStar review.

**Who did what.** Lead developer: Khozhijon. I led the project from idea to submission and directed an AI pair-programmer (Claude Code) that helped write the code, which I reviewed and tested.

Kiro's free tier (50 credits a month) does not stretch to 26 implementation tasks, so I spent the
credits where Kiro's features mattered most (spec, hooks in the loop, MCP, a reviewer agent, tightly
briefed UI tasks) and built the rest against Kiro's spec, with the AI assistant helping write the code: the
steering, hooks, agent definitions and format notes, the six format modules, the export layer, the app
shell, the sheet and image viewers, the Autopsy, and the fixes noted in the reviews. Every Kiro session
has a review note next to its transcript. `docs/KIRO.md` in the
repository has the full account, including what went wrong.

Stack: TypeScript (strict), React, Vite, Vitest, fast-check. No format libraries: every decoder is
written from the published format descriptions. Runtime dependencies: React and `fflate`.

## Challenges we ran into

- **The cheapest model was the most expensive.** The first four tasks went to the model with the
  lowest credit multiplier. It needed four to ten times as many steps, re-read files and looped on
  its own failing tests, and every step re-sends the context: 4.6, 8.9, 3.5 and 6.6 credits. A
  stronger model at eight times the multiplier then did the two viewer tasks for under one credit
  each.
  Cost is steps times context, not the price tag.
- **Agents typing data from memory.** One session tried to write four 128-entry code page tables by
  recall and got them wrong. Lookup tables are generated from the Unicode mapping data now.
- **Review caught what the agent's own checks did not**: 32-bit reads that came back negative, a
  string read that ran one byte past the buffer, a server importing a file that did not exist. Each
  has a review note and a regression test.
- **Hooks that never fired.** The first file-save matchers were anchored to relative paths while Kiro
  passes absolute ones. The transcripts showed zero runs; fixed, then 74.
- **A promise that was not kept.** The first service worker stored no scripts or styles on a first
  visit, so "works offline" was false while the page already said "Offline ready". It was found on the
  live site, fixed, and is now checked by a real test: visit once, cut the network, reload, open every
  sample.
- **Round trips force precision.** "decode(encode(m)) equals m" sounds simple until it has to hold
  for palettes of any length, WordStar soft line breaks and Lotus formula parentheses.

## Accomplishments that we're proud of

- The Autopsy is not a second parser. Decoders can only read through a reader that records what each
  field is, so the explanation and the decoding cannot drift apart, and a property test proves that
  every byte of an encoded file is explained exactly once.
- Lotus formulas come back to life: bytecode to 1-2-3 text to Excel, and the workbook recalculates.
- Rows that someone "deleted" in dBASE are still in the file, and Exhume shows them.
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

## Short "How was Kiro used?" field (the form's technology-requirement field)

Kiro CLI 3.5.0, headless, free tier: 10 sessions, about 44 of 50 credits, every transcript with its
cost in docs/kiro-sessions/. Spec-driven: one spec-mode session wrote requirements (23, EARS), design
(12 correctness properties) and tasks (26, all done), the contract that let five format modules be
written in parallel and fit on the first try. Steering: 5 docs, 2 file-matched; each promise is a rule
in steering and a check in a hook. Hooks: PreToolUse shell guard (110 runs), PostFileSave promise
guard (74), PostFileSave test runner (25), SessionStart brief (7), Stop type-check (5). MCP: the
project's own server, exhume-mcp (identify, hexdump, autopsy, decode), which Kiro used to look inside
binary files instead of guessing. Custom agents: gravedigger (implements one task) and coroner
(read-only reviewer). Property-based tests from the spec's properties; one found a ten-byte Lotus
formula bug that example tests missed. Kiro powers: not used. Kiro implemented the spec, scaffold,
ByteReader/ByteWriter, PackBits, the first MCP server, the samples generator, two viewers, the
offline/accessibility pass and a review. Lead developer: Khozhijon. I led the project from idea to
submission and directed an AI pair-programmer (Claude Code) that helped write the code, which I
reviewed and tested; the rest was built against Kiro's spec with its help, and every Kiro session has
a review note. Full account: docs/KIRO.md.

## Entered in the Devpost form on 22 Nov 2026 (draft 1314011, not submitted)

- Project page (draft): https://devpost.com/software/exhume-ix0s73
- Story: the sections above. Tags: kiro, typescript, react, vite, vitest, fast-check,
  model-context-protocol, fflate, github. Seven screenshots from `docs/img/` with captions.
- Category: Resurrection. Submitter type: Individual.
- "How the project meets the technology requirement": the Kiro breakdown (specs, steering, hooks with
  run counts, MCP, custom agents, property-based tests, powers not used, what Kiro implemented and
  what was implemented with the AI pair-programmer).
- "Pre-existing code": none; first commit 21 Nov 2026; libraries listed.
- "Testing instructions": no account needed; click a tombstone or drop a file; tested in
  Chromium-based browsers; `npm install && npm test`.
- Prizes entered: Best Student Project: Resurrection (the student details are in the form, visible to
  judges and organizers only; they are not kept in this repository).
- Not done yet: the terms box and Submit.

## Entered in the Devpost form on 26 Nov 2026 (entry stays submitted)

- Story: "How we built it" rewritten as "How we built it: how Kiro was used", one paragraph per item
  in the judges' write-up list (which Kiro, spec, steering, hooks, MCP, custom agents, PBT, powers),
  plus what Kiro wrote, by file. Nothing new is claimed; every number is from docs/KIRO.md and the
  transcripts.
- Built with: kiro, kiro-cli, typescript, react, vite, vitest, fast-check, model-context-protocol, fflate, node.js, github-actions, github.
- Technology-requirement field: the 22 Nov list kept, with additions (sessions and credits, why the CLI, spec vs prompting, steering strategy, hook run counts, what MCP showed in the bytes, the PBT counterexample, powers as next step). Not replaced by the short text above.
- Video: unchanged. Its Kiro scenes already run from 1:38 to 2:38 (spec, steering/hooks/MCP/agents,
  what each session cost and who did what).
- Paste-ready copy of the story: video/out/devpost-story.md (git-ignored).
