#!/bin/bash
# Hand one spec task to the gravedigger agent (Kiro CLI, non-interactive).
# usage: scripts/kiro-task.sh <task-number> [model] [extra note file]
set -u
cd "$(dirname "$0")/.."
n="$1"; model="${2:-auto}"; note="${3:-}"
prompt="docs/kiro-sessions/prompts/task-$(printf %02d "$n").md"
if [ ! -f "$prompt" ]; then
  {
    echo "Implement task $n of the spec in .kiro/specs/exhume-core/tasks.md, including every sub-task."
    echo "Sub-tasks marked optional with \`*\` (the property tests) are REQUIRED in this project: write them and make them pass."
    echo "Read the task, the requirements it lists, and the matching parts of design.md first."
    echo "Stay inside this task. When it is done and \`npm run typecheck\` and \`npm test\` pass, mark the task and its sub-tasks [x] in tasks.md and give the short report your instructions describe."
    if [ -n "$note" ] && [ -f "$note" ]; then echo; echo "Notes from the reviewer:"; cat "$note"; fi
  } > "$prompt"
fi
exec scripts/kiro.sh "task-$(printf %02d "$n")" "$model" "$prompt" --agent gravedigger
