# Review: task 3, code pages and PackBits (reviewer: Claude Code)

Kiro CLI (gravedigger, qwen3-coder-next), transcript `docs/kiro-sessions/20261121-043726-task-03.log`.
The run was stopped by the reviewer after 50 tool calls.

- DONE by Kiro: the three review fixes in `reader.ts` with regression tests; `packbits.ts` (strict
  decode, row-aware encode) with example tests and the Property 5 round-trip tests. All pass.
- STOPPED: `codepage.ts`. The model was writing four 128-entry character tables from memory, got them
  wrong (for example CP437 0xA0 and MacRoman 0xA0) and was looping on its own failing tests. A lookup
  table is data, not something to recall: the reviewer regenerated the four tables from the Unicode
  mappings shipped with Python's codecs and rewrote the tests against the published charts.
- ADDED by reviewer: `unpackBits` (lenient decode for truncated files), `ByteReader.text/mark/peek`,
  `annotations.ts` (coverage helpers) and `testing.ts` (one shared harness for properties P1-P4).
- HOOKS: `Guard the promises` and `Test what was touched` now fire on every agent file save (25 runs
  each in this session); `Shell guard` ran before all 15 shell commands.

Lesson recorded for the write-up: on the free tier (50 credits) the cost of a Kiro task is driven by
steps x context, so Kiro gets the tasks that are logic, not data entry, and gets them with the task
and design excerpts inlined.
