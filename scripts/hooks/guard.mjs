#!/usr/bin/env node
// Kiro hook (PostFileSave, command): enforce the project's promises on the file the agent just saved.
// Receives the hook event as JSON on stdin. Exit 0 = fine. Any other exit sends stderr back to the agent.
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { relative, resolve } from "node:path";

function readEvent() {
  try {
    const raw = readFileSync(0, "utf8");
    if (process.env.EXHUME_HOOK_DEBUG) appendFileSync(process.env.EXHUME_HOOK_DEBUG, raw + "\n---\n");
    return JSON.parse(raw || "{}");
  } catch { return {}; }
}
function findPath(o) {
  if (!o || typeof o !== "object") return null;
  for (const k of ["file_path", "filePath", "path", "file"]) if (typeof o[k] === "string") return o[k];
  for (const v of Object.values(o)) { const p = findPath(v); if (p) return p; }
  return null;
}

const file = process.argv[2] || findPath(readEvent());
if (!file || !existsSync(file)) process.exit(0);
const rel = relative(process.cwd(), resolve(file)).replaceAll("\\", "/");
if (!/^(src|mcp)\/.*\.(ts|tsx|mjs)$/.test(rel) || /\.test\.tsx?$/.test(rel)) process.exit(0);

const text = readFileSync(file, "utf8");
const problems = [];
const rule = (re, where, msg) => {
  if (!where.test(rel)) return;
  const lines = text.split("\n");
  lines.forEach((line, i) => { if (re.test(line) && !/guard-ok/.test(line)) problems.push(`${rel}:${i + 1}: ${msg}`); });
};

// Promise 1: private. No network calls anywhere in the app.
rule(/\b(fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|new\s+WebSocket)/, /^src\//,
  "network call in app code. Exhume never sends data anywhere (steering: product.md, promise 1).");
// Format code never touches the DOM, UI code never parses bytes.
rule(/\b(document\.|window\.|HTMLElement)/, /^src\/(core|formats)\//,
  "DOM access in core/format code (steering: structure.md).");
rule(/new\s+DataView\s*\(/, /^src\/formats\//,
  "raw DataView in a format module. Read through ByteReader so every field is annotated.");
rule(/new\s+DataView\s*\(|\.getUint(8|16|32)\s*\(/, /^src\/ui\//,
  "byte parsing in UI code (steering: structure.md).");
// Legacy text is bytes, not UTF-8.
rule(/TextDecoder\s*\(\s*(["']utf-?8["'])?\s*\)/i, /^src\/formats\//,
  "TextDecoder in a format module. Use src/core/codepage.ts (steering: formats.md, rule 7).");
// No Node Buffer in browser code, no `any` in core/formats.
rule(/\bBuffer\./, /^src\//, "Node Buffer in browser code. Use Uint8Array.");
rule(/:\s*any\b|\bas\s+any\b|<any>/, /^src\/(core|formats)\//, "`any` in core/format code (steering: tech.md).");

if (text.split("\n").length > 320) problems.push(`${rel}: ${text.split("\n").length} lines. Split files over ~300 lines.`);

if (problems.length) {
  console.error("Exhume guard: fix these before continuing\n" + problems.join("\n"));
  process.exit(2);
}
