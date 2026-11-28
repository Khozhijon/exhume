# How Kiro was used to build Exhume

This is the full account, including the parts that went badly. Every Kiro session mentioned here has a
transcript in [`docs/kiro-sessions/`](kiro-sessions) (prompt files in `kiro-sessions/prompts/`), and
every review of Kiro's output is in [`docs/reviews/`](reviews).

Tools: **Kiro CLI 3.5.0** in headless mode (`kiro-cli chat --v3 --no-interactive`), on the **free
tier** (50 credits a month).

Lead developer: Khozhijon. I led the project from idea to submission and directed an AI
pair-programmer (Claude Code) that helped write the code, which I reviewed and tested. It helped me run and review
the Kiro sessions (it is "the reviewer" below) and build what the credits could not buy: see
"Division of labour" at the end. Nothing here was built before the submission
period.

## 1. Spec-driven development

The project started from a two-page brief ([`docs/brief.md`](brief.md)) and byte-layout notes for the
six formats ([`docs/formats/`](formats)). One Kiro session in spec mode
(`--mode spec`, requirements-first, model `auto`) turned those into
[`.kiro/specs/exhume-core/`](../.kiro/specs/exhume-core):

- `requirements.md`: 23 requirements with EARS acceptance criteria. One per format with the
  byte-level behaviour that matters ("IF the compressed input is exhausted before 51,840 bytes are
  produced, THEN THE SYSTEM SHALL fill remaining pixels with white and add a warning").
- `design.md`: architecture, the core TypeScript types, the `ByteReader`/`ByteWriter` interfaces,
  per-format notes, the Lotus formula decompiler and Lotus-to-Excel translator, and **12 numbered
  correctness properties**, each ending in "Validates: Requirements x.y". It also recorded decisions
  the brief had left open (for example: Lotus `#AND#` becomes `*` in Excel because Lotus logic is
  numeric).
- `tasks.md`: 26 tasks, each ending in `_Requirements: ..._`, with property tests as sub-tasks placed
  right after the code they test.

That spec was the contract for everything after it, whoever wrote the code. The shared type
definitions in `src/core/types.ts`, the one-interface-per-format design, and the four properties
every format must satisfy all come from it. Five format modules were later written in parallel by
separate agents that never saw each other's work; they fit together on the first try because they
were all written against the same `design.md`.

Compared with prompting directly: the spec session cost 9.8 credits, a fifth of the month. It was the
best money spent. The sessions that went wrong (below) went wrong on execution, never on "what are we
building".

## 2. Steering

[`.kiro/steering/`](../.kiro/steering) has five documents:

| file | inclusion | what it does |
|---|---|---|
| `product.md` | always | The four promises: private, honest, never crashes on bad input, faithful. The voice. |
| `tech.md` | always | Stack, allowed dependencies, "no format libraries", commands, rules for agents. |
| `structure.md` | always | Folder layout and the `FormatModule` contract every format obeys. |
| `formats.md` | fileMatch `src/formats/**`, `src/core/**`, `mcp/**` | How to write a format module, properties P1-P4, a core API cheat sheet. |
| `ui.md` | fileMatch `src/ui/**`, CSS, `index.html` | Palette, type, motion, period frames, accessibility rules. |

What made the biggest difference was writing the promises as testable rules and then enforcing them
twice: once in steering (the agent knows the rule) and once in a hook (the agent is told when it
breaks it). "Decoders read only through `ByteReader`" is one line of steering; it is also why the
Autopsy view exists without a second parser.

## 3. Agent hooks

[`.kiro/hooks/`](../.kiro/hooks), all command hooks except the last. Counts are from the transcripts.

| hook | trigger | what it does | runs |
|---|---|---|---|
| Shell guard | `PreToolUse` on shell | Refuses git writes, sudo, downloads, installers, unlisted `npm install <pkg>`, anything outside the repo. This is what made it acceptable to trust the shell tool in headless runs. | 110 |
| Guard the promises | `PostFileSave` | Scans the saved file: no `fetch`/XHR in app code, no DOM in format code, no raw `DataView` outside `ByteReader`, no `TextDecoder` on legacy text, no `any`, no 300-line files. Violations go back to the agent. | 74 |
| Test what was touched | `PostFileSave` on `src/core`, `src/formats`, `src/export` | Runs that folder's example and property tests and returns failures. | 25 |
| Session brief | `SessionStart` | Puts spec progress, the next open task and the working-tree state into context. | 7 |
| No red on stop | `Stop` | Type-checks before the agent may finish. | 5 |
| New format checklist | `PostFileCreate`, agent prompt | Reminds the agent of the format contract when it creates a format's `index.ts`. | 0: Kiro never created one |

Things learned the hard way: the shell guard's first version let `npm install --save-dev <pkg>`
through (it only matched `npm install <pkg>`), and an agent installed a package nobody asked for; the
file-save matchers were anchored to a relative path while Kiro passes absolute paths, so they never
fired in the first sessions. Both are fixed and both stories are in `docs/reviews/`.

## 4. MCP

The project ships its own MCP server, [`mcp/server.mjs`](../mcp/server.mjs) (**exhume-mcp**), and
registers it in [`.kiro/settings/mcp.json`](../.kiro/settings/mcp.json). It exposes the project's own
decoders as tools: `identify`, `hexdump`, `autopsy` (the annotation tree as text, depth-limited) and
`decode` (content summarised: no megabytes of pixels).

Why: an agent working on a binary format cannot `cat` a fixture. Without the server it guesses; with
it, it looks. Kiro used it in two sessions: after generating the sample files it ran
`@exhume/autopsy` on `GHOST.MAC` and `RESIDENT.DBF` to check what a user would see, and as the
`coroner` reviewer it used `identify`, `autopsy` and `hexdump` on `LETTER.WS` to confirm, in the
bytes, a word-final high bit, a soft carriage return (`8D 0A`) and the `^Z` padding.

## 5. Custom agents

[`.kiro/agents/`](../.kiro/agents):

- **gravedigger** implements exactly one spec task: reads the task and the design sections, writes
  code and tests, runs the checks, marks the task done, reports.
- **coroner** reviews against the spec and the correctness properties and may not edit `src/`. Its
  review of the WordStar module is [`docs/reviews/coroner-wordstar.md`](reviews/coroner-wordstar.md).

## 6. Property-based tests

The spec names the properties; the tests are fast-check. Kiro wrote the first ones (annotation
coverage for `ByteReader`, the PackBits round trip). The four properties every format must pass live
in one shared harness, `src/core/testing.ts`, so a format cannot pass with a weaker version of them.
Kiro's "Correctness" feature (property extraction in the spec UI) is IDE-only, so in this CLI-driven
project the link from requirement to property to test is kept by convention: property numbers in
`design.md`, the same numbers in task names and test titles.

What PBT caught that example tests would not: Property 8 (Lotus formulas decompile and compile back
to the same text, 3000 runs) failed on run 368 of one execution; fast-check shrank the input to ten
bytes, a range whose corners are stored out of order. The story and the fix are in
[`reviews/task-13.md`](reviews/task-13.md).

## 7. What went wrong, and what it taught

Credits per session (free tier, 50 a month):

| session | model | steps | credits | outcome |
|---|---|---|---|---|
| spec | auto | | 9.8 | all three spec documents |
| task 1, scaffold | qwen3-coder-next | ~100 | 4.6 | passed after reviewer fixes |
| task 2, ByteReader/Writer | qwen3-coder-next | ~190 | 8.9 | 55 tests; two real bugs found in review, fixed by Kiro in task 3 |
| task 3, code pages + PackBits | qwen3-coder-next | 50 | 3.5 | PackBits done; stopped while writing lookup tables from memory |
| task 4, MCP skeleton | qwen3-coder-next | 96 | 6.6 | stopped in a debugging loop; finished by the reviewer |
| task 17, Table Viewer | claude-haiku-4.5 | 27 | 0.96 | done in 57 seconds |
| task 18, Document Viewer | claude-haiku-4.5 | 21 | 0.76 | logic right, CSS redone by the reviewer |
| task 13, samples generator | claude-haiku-4.5 | 65 | 5.4 | done; sample content rewritten by the reviewer |
| coroner review, WordStar | claude-haiku-4.5 | 29 | 1.0 | review report |
| task 25, offline + accessibility | claude-haiku-4.5 | 59 | 2.7 | done |

1. **The cheapest model was the most expensive.** qwen3-coder-next is listed at 0.05x credits, so the
   first four tasks went to it. It needed four to ten times as many steps, re-read files, looped on
   its own failing tests, and every step re-sends the context. claude-haiku-4.5 at 0.4x finished
   comparable tasks for a tenth of the credits.
2. **Cost is steps times context.** After task 2 the prompts changed: the task block and the relevant
   `design.md` sections are inlined (`scripts/kiro-task.sh`), with an explicit instruction not to
   read the whole spec. `kiro-cli --output-format stream-json` reports credits per turn; a small
   formatter (`scripts/kiro-format.mjs`) puts that number at the end of every transcript.
3. **Data is not a job for recall.** The agent tried to type four 128-entry character tables from
   memory and got them wrong. The reviewer generated them from the Unicode mapping data instead.
4. **Review is not optional.** `u32` reads that returned negative numbers, a string read that ran one
   byte past the buffer, a server importing a file that did not exist: all passed the agent's own
   checks. Each has a review note and a regression test.

## 8. Division of labour (the honest version)

With 50 credits, Kiro could not implement 26 tasks. So the remaining credits went where Kiro's
features mattered most (spec, hooks in the loop, MCP, a reviewer agent, UI tasks with a tight brief),
and I built the rest against Kiro's spec, with the AI assistant helping write the code.

**Kiro wrote:** the spec (requirements, design, tasks); the project scaffold; `ByteReader`,
`ByteWriter` and their tests; the PackBits codec and its property tests; the first MCP server; the
samples generator, its data models and tests; the Table Viewer; the Document Viewer component; the
service worker, manifest and accessibility pass; the WordStar review. It also fixed one decoder bug it
found along the way. The service worker did not keep its promise on a first visit; that was found
on the live site and fixed in review ([`reviews/task-25.md`](reviews/task-25.md)).

**Built by me with the AI assistant's help:** the brief, format notes, steering documents, hooks and agent definitions; the
prompts and review notes for every Kiro session; the six format modules, the export layer and the
drawing code for the image samples (as parallel subagents, each given the spec and steering as its
contract); the code page tables, the shared property harness, the final MCP server; the app shell,
image viewer, Lotus sheet viewer, Autopsy view and file map; the stylesheet fixes and content rewrites
noted in the reviews.

**IDE or CLI?** CLI only. Headless runs made each Kiro session a reproducible artefact: a prompt
file in, a transcript with its cost out, a review next to it.
