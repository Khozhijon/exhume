Implement task 4 of the spec in .kiro/specs/exhume-core/tasks.md, including every sub-task.
Sub-tasks marked optional with `*` (the property tests) are REQUIRED in this project: write them and make them pass.

Work economically: the task text and the design sections you need are inlined below, so do NOT
read requirements.md, design.md or tasks.md in full. Use grep on them only for a specific detail.
Read existing source files you depend on once (several in one step). Write each file in one go,
several files per step. No exploratory listing, no long narration. Check with ONE command:
`npm run -s typecheck && npx vitest run <folders you touched> 2>&1 | tail -40`. At most 3 fix rounds;
if something still fails after that, stop and say exactly what fails.

## The task (from tasks.md)
- [ ] 4. MCP server skeleton — identify and hexdump
  - Create `mcp/server.mjs` as a Node.js stdio MCP server using `@modelcontextprotocol/sdk`
  - Implement the `identify` tool: read file with `fs.readFileSync`, convert to `Uint8Array`, call `registry.detect()`, return matches sorted by confidence descending
  - Implement the `hexdump` tool: read file, return classic hex+ASCII lines (16 bytes/row, format `0000: 4D 5A 90 00  MZ..`)
  - Import from `dist/core/registry.js`; wrap all tool handlers so `ExhumeError` returns `{ error: message }` instead of crashing
  - Create `mcp/server.test.mjs` with example tests for `hexdump` output format (offset formatting, ASCII column, short last row)
  - _Requirements: 23.1, 23.2, 23.3_


## Design excerpts (from design.md)
## MCP Server

Located at `mcp/server.mjs`. Imports `dist/core/registry.js` (the compiled TypeScript core).
Uses `@modelcontextprotocol/sdk` for stdio transport and tool registration.

All tools accept `filePath: string`. The server reads the file synchronously with `fs.readFileSync`,
converts to `Uint8Array`, then calls the registry.

**Tool: `identify`**
Input: `{ filePath: string }`
Output: `{ matches: Array<{ id: string; name: string; confidence: number }> }` sorted descending.

**Tool: `hexdump`**
Input: `{ filePath: string; offset: number; length: number }`
Output: `{ lines: string[] }` — classic format: `0000: 4D 5A 90 00  MZ..` (16 bytes/row).

**Tool: `autopsy`**
Input: `{ filePath: string }`
Output: `{ annotations: Annotation[] }` — top-level annotation array from the decoded Specimen.

**Tool: `decode`**
Input: `{ filePath: string }`
Output: `{ specimen: Specimen }` — full payload, annotations, warnings, meta.

Error handling: `ExhumeError` → return `{ error: string }` as tool content (no crash). Any other
error propagates and kills the server process.

---



## Notes from the reviewer
The installed SDK is `@modelcontextprotocol/sdk` 1.32 and `zod` 3. Use exactly this API (do not guess others):
```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
const server = new McpServer({ name: 'exhume-mcp', version: '0.1.0' });
server.tool('hexdump', 'one-line description', { path: z.string(), offset: z.number().int().min(0).optional() },
  async ({ path, offset }) => ({ content: [{ type: 'text', text: '...' }] }));
await server.connect(new StdioServerTransport());
```
Layout:
- `mcp/lib.mjs`: pure functions, no SDK import: `hexdump(bytes, offset = 0, length = 256)` returning
  lines like `00000000: 0A 05 01 08 00 00 00 00  3F 01 C7 00 48 00 48 00  |........?...H.H.|`
  (8-digit hex offset, 16 bytes per row in two groups of 8, ASCII column with `.` for non-printable,
  short last row padded so the ASCII column lines up); `safeRead(path, root = process.cwd())` that
  resolves the path, refuses anything outside `root` (throw an Error with a clear message) and files
  larger than 100 MB, and returns a Uint8Array; `identifyBytes(bytes, fileName, registry)` returning
  `[{ id, name, confidence }]` sorted by confidence descending, given the imported registry module.
- `mcp/server.mjs`: registers the tools `hexdump { path, offset?, length? }` (length capped at 4096)
  and `identify { path }`, imports the compiled core from `./dist/core/registry.js` (built by
  `npm run build:core`, which you may run; other people are editing `src/formats` right now, so ignore
  type errors it prints from `src/formats` or `src/export`, the JS is still emitted). Every handler
  catches errors and returns `{ content: [{ type: 'text', text: 'error: ...' }], isError: true }`.
  Nothing is written to stdout except by the transport (stdout is the protocol); log to stderr only.
- `mcp/lib.test.mjs`: vitest tests for `hexdump` (offset column, grouping, ASCII column, short last
  row, offset/length windowing, empty input) and `safeRead` (path escape refused).
Touch only files under `mcp/` and the task checkbox. Check with `npx vitest run mcp 2>&1 | tail -30`
and by starting the server once: `npm run -s build:core; echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' | node mcp/server.mjs | head -c 400`.

## Finish
When the check command passes, mark task 4 and its sub-tasks [x] in tasks.md and give a report of at most 12 lines.
