#!/usr/bin/env node
// Kiro hook (PreToolUse on shell tools, command): refuse shell commands an implementing agent has no
// business running. Exit 0 = allow. Exit 2 = block, stderr goes back to the agent.
import { readFileSync, appendFileSync } from "node:fs";

let raw = "";
try { raw = readFileSync(0, "utf8"); } catch { /* no stdin */ }
if (process.env.EXHUME_HOOK_DEBUG) appendFileSync(process.env.EXHUME_HOOK_DEBUG, raw + "\n---\n");

let event = {};
try { event = JSON.parse(raw || "{}"); } catch { /* not JSON: treat the text itself as the command */ }

function commands(o, out = []) {
  if (typeof o === "string") return out;
  if (!o || typeof o !== "object") return out;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string" && /^(command|cmd|script|commandLine)$/i.test(k)) out.push(v);
    else commands(v, out);
  }
  return out;
}
const cmds = commands(event);
if (!cmds.length && raw && !raw.trim().startsWith("{")) cmds.push(raw);

const banned = [
  [/\bgit\s+(commit|push|reset|rebase|checkout|restore|clean|stash|merge|tag|remote|config)\b/, "git writes are the reviewer's job"],
  [/\bsudo\b/, "no sudo"],
  [/\b(curl|wget|nc|ssh|scp)\b/, "no downloads or network tools"],
  [/\brm\s+(-[a-zA-Z]*\s+)*(\/|~|\$HOME|\.\.)/, "no deletes outside the repository"],
  [/\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+(\.git|\.kiro|docs|src)\b/, "do not delete project folders"],
  [/\bnpm\s+(publish|login|adduser|token|config\s+set)\b/, "no npm account actions"],
  [/\b(npm|pnpm|yarn)\s+(install|i|add)\s+(?!-)[^\s]/, "ask before adding a dependency (tech.md lists what is allowed)"],
  [/\b(brew|pip|pip3|gem|cargo)\s+install\b/, "no installers"],
  [/(^|[;&|]\s*)(open|osascript|defaults|launchctl|killall|chmod\s+-R|chown)\b/, "no system changes"],
  [/>\s*(\/|~)(?!\/?dev\/null)/, "no writes outside the repository"],
];
for (const cmd of cmds) {
  for (const [re, why] of banned) {
    if (re.test(cmd)) {
      console.error(`Exhume shell guard blocked this command (${why}):\n  ${cmd}\nUse npm run typecheck / npm test / npx vitest / node scripts, or say what you need in your report.`);
      process.exit(2);
    }
  }
}
