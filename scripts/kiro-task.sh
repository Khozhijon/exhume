#!/bin/bash
# Hand one spec task to the gravedigger agent (Kiro CLI, non-interactive).
# usage: scripts/kiro-task.sh <task-number> [model] [design headings, comma separated] [note file]
# The prompt inlines the task block and the named design.md sections so the agent does not have to
# load the whole spec into its context (credits are scarce on the free tier).
set -u
cd "$(dirname "$0")/.."
n="$1"; model="${2:-qwen3-coder-next}"; heads="${3:-}"; note="${4:-}"
spec=".kiro/specs/exhume-core"
prompt="docs/kiro-sessions/prompts/task-$(printf %02d "$n").md"
section() { # print a "## x"/"### x" section of design.md whose heading contains $1
  awk -v pat="$1" '
    /^#{2,3} / { lvl = match($0, /[^#]/) - 1
                 if (on && lvl <= onlvl) on = 0
                 if (!on && index($0, pat)) { on = 1; onlvl = lvl } }
    on { print }' "$spec/design.md"
}
{
  echo "Implement task $n of the spec in $spec/tasks.md, including every sub-task."
  echo "Sub-tasks marked optional with \`*\` (the property tests) are REQUIRED in this project: write them and make them pass."
  echo
  echo "Work economically: the task text and the design sections you need are inlined below, so do NOT"
  echo "read requirements.md, design.md or tasks.md in full. Use grep on them only for a specific detail."
  echo "Read existing source files you depend on once. Write each file in one go. No exploratory listing."
  echo
  echo "## The task (from tasks.md)"
  awk -v n="$n" '
    $0 ~ "^- \\[.\\]\\*? " n "\\. " { on = 1; print; next }
    on && /^- \[.\]\*? [0-9]+\. / { on = 0 }
    on { print }' "$spec/tasks.md"
  if [ -n "$heads" ]; then
    echo
    echo "## Design excerpts (from design.md)"
    IFS=',' read -ra hs <<< "$heads"
    for h in "${hs[@]}"; do section "$h"; echo; done
  fi
  if [ -n "$note" ] && [ -f "$note" ]; then echo; echo "## Notes from the reviewer"; cat "$note"; fi
  echo
  echo "## Finish"
  echo "Run \`npm run typecheck\` and \`npx vitest run <the folders you touched>\`. Fix failures in the code."
  echo "Then mark task $n and its sub-tasks [x] in tasks.md and give the short report your instructions describe."
} > "$prompt"
exec scripts/kiro.sh "task-$(printf %02d "$n")" "$model" "$prompt" --agent gravedigger --trust-tools=run_command,fs_read,fs_write
