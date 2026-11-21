#!/usr/bin/env node
// exhume-mcp: the project's own decoders as MCP tools over stdio, so an agent working on a format can
// look inside a binary fixture instead of guessing. It imports the compiled core (npm run build:core)
// and never re-implements a format. stdout belongs to the protocol: log to stderr only.
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { hexdump, identifyBytes, renderAnnotations, safeRead, summarisePayload } from './lib.mjs';

let registry;
try {
  registry = await import('./dist/core/registry.js');
} catch (e) {
  console.error('exhume-mcp: compiled core not found. Run `npm run build:core` first.', e?.message ?? e);
  process.exit(1);
}

const server = new McpServer({ name: 'exhume-mcp', version: '0.1.0' });
const text = (s) => ({ content: [{ type: 'text', text: s }] });
const guard = (fn) => async (args) => {
  try {
    return text(await fn(args));
  } catch (e) {
    return { content: [{ type: 'text', text: `error: ${e?.message ?? String(e)}` }], isError: true };
  }
};
const file = { path: z.string().describe('File path inside the project, e.g. public/samples/GHOST.MAC') };

server.tool('identify', 'Ask every Exhume format module how confident it is that this file is its format.', file,
  guard(({ path: p }) => {
    const matches = identifyBytes(safeRead(p), path.basename(p), registry);
    return matches.length ? JSON.stringify(matches, null, 2) : 'no format module recognises these bytes';
  }));

server.tool('hexdump', 'Hex + ASCII dump of part of a file (16 bytes per row).',
  { ...file, offset: z.number().int().min(0).optional(), length: z.number().int().min(1).max(4096).optional() },
  guard(({ path: p, offset = 0, length = 256 }) => {
    const bytes = safeRead(p);
    return [`${p}: ${bytes.length} bytes`, ...hexdump(bytes, offset, Math.min(length, 4096))].join('\n');
  }));

server.tool('autopsy', 'Decode a file and return the annotation tree: which bytes are which structure, with decoded values.',
  { ...file, maxDepth: z.number().int().min(1).max(8).optional(), maxNodes: z.number().int().min(10).max(2000).optional() },
  guard(({ path: p, maxDepth = 3, maxNodes = 200 }) => {
    const bytes = safeRead(p);
    const { module, specimen } = registry.exhume(bytes, path.basename(p));
    return [
      `${p}: ${module.name} (${module.id}), ${bytes.length} bytes, ${specimen.warnings.length} warning(s)`,
      ...specimen.warnings.map((w) => `warning${w.offset !== undefined ? ` @${w.offset}` : ''}: ${w.message}`),
      ...renderAnnotations(specimen.annotations, { maxDepth, maxNodes }),
    ].join('\n');
  }));

server.tool('decode', 'Decode a file and return its content (summarised: no raw pixel dumps), meta and warnings as JSON.',
  { ...file, maxItems: z.number().int().min(1).max(500).optional() },
  guard(({ path: p, maxItems = 20 }) => {
    const { module, specimen } = registry.exhume(safeRead(p), path.basename(p));
    return JSON.stringify({ format: module.id, meta: specimen.meta, warnings: specimen.warnings, payload: summarisePayload(specimen.payload, { maxItems }) }, null, 2);
  }));

await server.connect(new StdioServerTransport());
console.error('exhume-mcp ready');
