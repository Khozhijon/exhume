#!/usr/bin/env node
// Turn `kiro-cli chat --output-format stream-json` (ACP events on stdin) into a readable transcript
// with per-turn credit usage. Used by scripts/kiro.sh; the transcript is what lands in docs/kiro-sessions/.
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });
let text = "";
let tools = 0, hooks = 0, turns = 0;
const toolTitles = new Map();
const flush = () => { if (text.trim()) console.log(text.trimEnd() + "\n"); text = ""; };
const short = (s, n = 160) => { s = String(s ?? "").replace(/\s+/g, " "); return s.length > n ? s.slice(0, n) + "..." : s; };

rl.on("line", (line) => {
  line = line.trim();
  if (!line.startsWith("{")) { if (line) { flush(); console.log(line); } return; }
  let ev; try { ev = JSON.parse(line); } catch { return; }
  if (ev.type === "runFinished") {
    flush();
    console.log(`# run finished: ${ev.data?.status} (${ev.data?.stopReason})`);
    return;
  }
  const u = ev.data?.update; if (!u) return;
  const k = u._meta?.kiro ?? {};
  switch (u.sessionUpdate) {
    case "agent_message_chunk":
      if (u.content?.type === "text") text += u.content.text;
      break;
    case "tool_call": {
      flush(); tools++;
      toolTitles.set(u.toolCallId, u.title);
      const input = u.rawInput ? short(JSON.stringify(u.rawInput), 200) : "";
      console.log(`[tool] ${u.title ?? u.kind ?? "tool"} ${input}`);
      break;
    }
    case "tool_call_update":
      if (u.status === "failed") console.log(`[tool failed] ${toolTitles.get(u.toolCallId) ?? u.toolCallId}: ${short(JSON.stringify(u.rawOutput ?? u.content ?? ""), 300)}`);
      break;
    case "session_info_update":
      if (k.kind === "hook_update" && k.hook?.status && k.hook.status !== "running" && k.hook.status !== "started") {
        hooks++; flush();
        console.log(`[hook] ${k.hook.name}: ${k.hook.status}${k.hook.message ? " - " + short(k.hook.message, 300) : ""}`);
      } else if (k.kind === "display_error") {
        flush(); console.log(`[error] ${k.message}`);
      } else if (k.kind === "turn_completion") {
        turns++; flush();
        const c = (k.promptTurnSummaries ?? []).map((s) => `${s.usage.toFixed(3)} ${s.unitPlural}`).join(", ");
        console.log(`# turn ${turns} done in ${Math.round((k.elapsedTime ?? 0) / 1000)}s, cost ${c}`);
      } else if (k.kind === "session_usage") {
        const c = (k.credits ?? []).map((s) => `${s.usage.toFixed(3)} ${s.unitPlural}`).join(", ");
        console.log(`# session usage: ${c} | tool calls: ${tools} | hook runs: ${hooks}`);
      }
      break;
  }
});
rl.on("close", flush);
