#!/usr/bin/env node
// Kiro hook (SessionStart, command): tell the agent where the project stands.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const lines = [];
const tasksFile = ".kiro/specs/exhume-core/tasks.md";
if (existsSync(tasksFile)) {
  const top = readFileSync(tasksFile, "utf8").split("\n").filter((l) => /^- \[[ x-]\]\*? \d+\. /.test(l));
  const done = top.filter((l) => /^- \[x\]/.test(l)).length;
  const next = top.find((l) => /^- \[ \]/.test(l));
  lines.push(`Spec exhume-core: ${done}/${top.length} top-level tasks done.`);
  if (next) lines.push(`Next open task: ${next.replace(/^- \[ \]\*? /, "")}`);
}
if (existsSync("src/formats")) lines.push(`Format modules present: ${readdirSync("src/formats").join(", ") || "none"}`);
try {
  const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  lines.push(`Uncommitted files: ${dirty.length}`);
} catch { /* not a repo yet */ }
lines.push("Reminder: do not commit or push. Run typecheck and the touched tests before finishing.");
console.log(lines.join("\n"));
