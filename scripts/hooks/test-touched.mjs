#!/usr/bin/env node
// Kiro hook (PostFileSave, command): run the tests that belong to the file the agent just saved.
// src/formats/<id>/* -> that format's tests; src/core/* and src/export/* -> their folder's tests.
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

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
if (!file) process.exit(0);
const rel = relative(process.cwd(), resolve(file)).replaceAll("\\", "/");
const m = rel.match(/^src\/(formats\/[^/]+|core|export)\//);
if (!m || !existsSync("node_modules/.bin/vitest")) process.exit(0);

const dir = `src/${m[1]}`;
const run = spawnSync("node_modules/.bin/vitest", ["run", dir, "--reporter=dot", "--passWithNoTests"], {
  encoding: "utf8", timeout: 50_000,
});
if (run.status !== 0) {
  const out = `${run.stdout || ""}\n${run.stderr || ""}`.split("\n").slice(-60).join("\n");
  console.error(`Tests in ${dir} fail after your change to ${rel}:\n${out}`);
  process.exit(2);
}
console.log(`tests in ${dir}: pass`);
