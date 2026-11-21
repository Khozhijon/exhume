# Review: tasks 13, 17, 18 (Kiro CLI, gravedigger agent, model claude-haiku-4.5; reviewer: Claude Code)

Switching the agent from the cheapest model to claude-haiku-4.5 changed everything: fewer steps, no
loops, and a lower total cost per task.

| task | what | steps | credits | transcript |
|---|---|---|---|---|
| 17 | Table Viewer (dBASE browse screen) | 27 | 0.96 | `20261121-050136-task-17.log` |
| 18 | Document Viewer (fan-fold paper) | 21 | 0.76 | `20261121-050259-task-18.log` |
| 13 | Samples generator + data samples + tests | 65 | 5.42 | `20261121-050520-task-13.log` |

Task 13
- GOOD: `scripts/gen-samples.mjs` proves every sample before writing it (right module detected,
  payload deep-equal to the model, zero warnings, annotations tile the file), then writes
  `public/samples/*`, `index.json` and the embedded `src/samples/data.ts`.
- GOOD: the agent used the project's own MCP server (`@exhume/autopsy` on GHOST.MAC and RESIDENT.DBF)
  to check what it had generated.
- SHOULD, found by Kiro and kept: `src/formats/wk1/decode.ts` called `readCell` for non-cell records;
  the agent added the `CELL_RECORDS.has(type)` guard (outside its file list, but a correct fix).
- CONTENT, rewritten by the reviewer: the budget worksheet (it had a date stored with a percent format,
  an `@AVG` over an unrelated range, no column widths, a wrong named range) and the WordStar letter
  (anachronisms, too short). The models now exercise currency formats, integer and number records,
  repeat labels, an absolute reference, `@IF`/`@MAX`, a D-MMM-YY date and a named range; the letter
  is ~330 words with every run style, a page break, header and footer.
- Tests in `src/samples/samples.test.ts` updated to the new content.

Tasks 17 and 18: reviewed in the browser (see the UI review notes in the commit that follows).

## Later: a bug found by a property test (21 Nov)

Property 8 ("decompiling arbitrary bytes never throws, and its text compiles back to the same text",
3000 runs) passed for hours and then failed on run 368 of one execution. fast-check shrank the input
to ten bytes: a range whose corners are stored out of order (`DZ$1..$DY$129`). The decompiler printed
the file faithfully, but the formula compiler silently reordered the corners, so the text did not
compile back to the same bytes. Fix: the compiler keeps corners as written
(`src/formats/wk1/formula-parse.ts`); regression test with the shrunk counterexample in
`formula.test.ts`. An example test would never have found this.
