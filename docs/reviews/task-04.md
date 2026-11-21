# Review: task 4, exhume-mcp skeleton (reviewer: Claude Code)

Kiro CLI (gravedigger, qwen3-coder-next), transcript `docs/kiro-sessions/20261121-045129-task-04.log`.
Stopped by the reviewer after 96 tool calls.

- GOOD: with the SDK API given in the prompt the agent used `McpServer`, `StdioServerTransport` and zod
  shapes correctly, split pure functions into `mcp/lib.mjs`, and wrote path-escape protection.
- BLOCKER: `server.mjs` imported `./lib.mjs.js` (does not exist), so the server never started.
- BLOCKER: `hexdump` padding for short rows was wrong and the agent spent ~40 steps adding
  `console.error` probes without finding it (it skipped the separator for padding bytes, then padded
  to a width that did not include the group gap).
- SHOULD: `autopsy` and `decode` returned the whole annotation tree / payload as JSON, megabytes for a
  picture: unusable in an agent's context window.
- Reviewer rewrote `lib.mjs`, `server.mjs` and the tests: fixed hexdump, symlink-safe `safeRead`,
  `renderAnnotations` (depth and size capped), `summarisePayload` (no pixel dumps). 13 tests pass and
  the server answers `initialize`. This also covers task 24 (autopsy and decode tools).

Verdict: taken over by the reviewer. For the remaining Kiro tasks a stronger model is used
(the cheapest model costs less per step but needs several times more steps, and still loops).
