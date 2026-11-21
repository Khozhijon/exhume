# Review: task 2, ByteReader and ByteWriter (reviewer: Claude Code)

Implemented by Kiro CLI (gravedigger, qwen3-coder-next), transcript
`docs/kiro-sessions/20261121-004238-task-02.log`. 55 tests pass, typecheck clean.

- BLOCKER: `u32le` / `u32be` build the value with `b3 << 24`, which is a signed 32-bit operation in
  JavaScript. Any value >= 0x80000000 comes back negative (and its hex annotation is wrong). Use
  `>>> 0`. Add example tests for 0xFFFFFFFF and 0x80000000 in both byte orders.
- BLOCKER: `nullString` sets `offset = end + 1` even when no NUL was found, so on an unterminated
  string the offset runs one past the end of the buffer (`remaining` becomes -1) or swallows one byte
  beyond `maxLen`. Consume the terminator only if it is there. Add tests: unterminated at end of
  buffer, `maxLen` reached without NUL.
- SHOULD: `bytes(n)` and `skip(n)` accept negative or fractional `n` (a negative `n` moves the cursor
  backwards). Throw `ExhumeError` unless `n` is a non-negative integer. Add a test.
- SHOULD: the agent installed `@fast-check/vitest`, which tech.md does not allow and nothing uses.
  Removed by the reviewer; the shell guard now blocks `npm install <package>` with flags too.
- NIT: property test P3 only reads fixed-width fields; add `bytes`, `skip` and `nullString` to the
  generated read plan.

Verdict: FAIL until the two blockers are fixed (handed to the agent with task 3).
