# Review: task 1, project scaffold (reviewer: Claude Code)

Implemented by Kiro CLI (gravedigger agent, model qwen3-coder-next), transcript
`docs/kiro-sessions/20261121-003455-task-01.log`.

- SHOULD, fixed by reviewer: `limits.ts` and `registry.ts` used `ExhumeError` without importing it.
- SHOULD, fixed by reviewer: extension tie-break in `registry.identify` had an operator-precedence bug
  (`'.' + x ?? ''`).
- SHOULD, fixed by reviewer: `tsconfig.json` emitted into `dist/` during `npm run build`; now `noEmit`,
  with a separate `tsconfig.core.json` that compiles the core for Node (`npm run build:core`).
- SHOULD, fixed by reviewer: `@modelcontextprotocol/sdk` pinned to an old 0.5 line; React and Node type
  packages were missing.
- OUT OF SCOPE, removed: the agent also wrote an `mcp/server.mjs` (task 4) against an SDK API that does
  not exist. Deleted so task 4 starts clean.
- PROCESS: shell commands were denied in headless mode, so the agent could not install or type-check.
  Fixed for later runs with `--trust-tools` plus the `shell-guard` PreToolUse hook.
- PROCESS: 100 tool calls for a scaffold. Later prompts inline the task and design excerpts.

Verdict: PASS after reviewer fixes.
