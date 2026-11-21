Before starting task 3, fix these review findings in `src/core/reader.ts` (from docs/reviews/task-02.md)
and add a regression test for each in `src/core/reader.test.ts`:
1. `u32le` and `u32be` return negative numbers for values >= 0x80000000 because `b3 << 24` is a signed
   operation. Use `>>> 0` on the result. Tests: 0xFFFFFFFF and 0x80000000, both byte orders; the
   annotation value must show the unsigned number.
2. `nullString` must consume the NUL terminator only when it found one. With no terminator it stops at
   `maxLen` or at the end of the buffer and the offset must never exceed `size`. Tests: unterminated
   string at end of buffer; `maxLen` reached without NUL leaves the next byte unread.
3. `bytes(n)` and `skip(n)` must throw `ExhumeError` unless `n` is a non-negative integer.
Do not install any package: `fast-check` is already installed and is imported as `import fc from 'fast-check'`.
