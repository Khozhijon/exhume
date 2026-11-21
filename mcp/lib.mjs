// exhume-mcp library: pure functions, no SDK import, so they can be unit-tested without a server.
import fs from 'node:fs';
import path from 'node:path';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Read a file as bytes. Refuses paths outside `root` and files over 100 MB. */
export function safeRead(filePath, root = process.cwd()) {
  const base = fs.realpathSync(path.resolve(root));
  const resolved = path.resolve(base, filePath);
  const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  if (real !== base && !real.startsWith(base + path.sep)) {
    throw new Error(`path is outside the project: ${filePath}`);
  }
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw new Error(`not a file: ${filePath}`);
  if (stat.size > MAX_FILE_SIZE) throw new Error(`file too large: ${stat.size} bytes (limit ${MAX_FILE_SIZE})`);
  return new Uint8Array(fs.readFileSync(real));
}

/**
 * Classic hex dump lines, 16 bytes per row in two groups of 8:
 * `00000000: 0A 05 01 08 00 00 00 00  3F 01 C7 00 48 00 48 00  |........?...H.H.|`
 * A short last row is padded so the ASCII column lines up.
 */
export function hexdump(bytes, offset = 0, length = 256) {
  const start = Math.max(0, Math.min(offset, bytes.length));
  const end = Math.max(start, Math.min(bytes.length, start + Math.max(0, length)));
  const lines = [];
  for (let row = start; row < end; row += 16) {
    let hex = '';
    let ascii = '';
    for (let j = 0; j < 16; j++) {
      const at = row + j;
      if (j > 0) hex += j === 8 ? '  ' : ' ';
      if (at < end) {
        const b = bytes[at];
        hex += b.toString(16).toUpperCase().padStart(2, '0');
        ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
      } else {
        hex += '  ';
        ascii += ' ';
      }
    }
    lines.push(`${row.toString(16).toUpperCase().padStart(8, '0')}: ${hex}  |${ascii}|`);
  }
  return lines;
}

/** Ask every format module how confident it is. Sorted by confidence, highest first. */
export function identifyBytes(bytes, fileName, registry) {
  return registry
    .detect(bytes, fileName)
    .map((m) => ({ id: m.module.id, name: m.module.name, confidence: Number(m.confidence.toFixed(3)) }));
}

/** Annotation tree as indented text, cut at `maxDepth` levels and `maxNodes` lines so it fits a context window. */
export function renderAnnotations(annotations, { maxDepth = 3, maxNodes = 200, maxChildren = 12 } = {}) {
  const lines = [];
  let hidden = 0;
  const hex = (n) => n.toString(16).toUpperCase().padStart(6, '0');
  const walk = (nodes, depth) => {
    nodes.forEach((a, i) => {
      if (lines.length >= maxNodes || i >= maxChildren) {
        hidden++;
        return;
      }
      const value = a.value !== undefined ? ` = ${a.value}` : '';
      const kids = a.children?.length ?? 0;
      lines.push(`${'  '.repeat(depth)}${hex(a.start)}..${hex(Math.max(a.start, a.end - 1))} (${a.end - a.start} B) ${a.label}${value}${kids && depth + 1 >= maxDepth ? ` [${kids} children]` : ''}`);
      if (kids && depth + 1 < maxDepth) walk(a.children, depth + 1);
    });
    if (nodes.length > maxChildren) lines.push(`${'  '.repeat(depth)}... ${nodes.length - maxChildren} more at this level`);
  };
  walk(annotations, 0);
  if (hidden && lines.length >= maxNodes) lines.push(`... output capped at ${maxNodes} lines`);
  return lines;
}

/** A specimen's payload cut down to something an agent can read: no megabytes of pixels. */
export function summarisePayload(payload, { maxItems = 20 } = {}) {
  switch (payload.kind) {
    case 'image': {
      const used = new Set();
      if (payload.bitsPerPixel !== 24) for (let i = 0; i < payload.pixels.length; i += 97) used.add(payload.pixels[i]);
      return {
        kind: 'image', width: payload.width, height: payload.height, bitsPerPixel: payload.bitsPerPixel,
        paletteEntries: payload.palette?.length ?? 0, palettePreview: payload.palette?.slice(0, 8),
        sampledDistinctIndices: used.size, firstRowPreview: Array.from(payload.pixels.slice(0, 32)),
      };
    }
    case 'sheet':
      return {
        kind: 'sheet', version: payload.version, range: payload.range, names: payload.names,
        cellCount: payload.cells.length, cells: payload.cells.slice(0, maxItems),
      };
    case 'table':
      return {
        kind: 'table', lastUpdate: payload.lastUpdate, fields: payload.fields,
        recordCount: payload.records.length, deleted: payload.records.filter((r) => r.deleted).length,
        records: payload.records.slice(0, maxItems),
      };
    case 'document':
      return {
        kind: 'document', header: payload.header, footer: payload.footer, blockCount: payload.blocks.length,
        blocks: payload.blocks.slice(0, maxItems),
      };
    default:
      return payload;
  }
}
