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
