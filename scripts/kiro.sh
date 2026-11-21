#!/bin/bash
# Run one non-interactive Kiro CLI session and keep its transcript in docs/kiro-sessions/.
# usage: scripts/kiro.sh <label> <model> <prompt-file> [extra kiro-cli chat args...]
set -u
cd "$(dirname "$0")/.."
label="$1"; model="$2"; prompt="$3"; shift 3
ts=$(date +%Y%m%d-%H%M%S)
log="docs/kiro-sessions/${ts}-${label}.log"
KIRO="${KIRO_CLI:-$HOME/.local/bin/kiro-cli}"
{
  echo "# kiro-cli $("$KIRO" --version 2>/dev/null) run: $label"
  echo "# model: $model"
  echo "# extra args: $*"
  echo "# prompt file: $prompt"
  echo
} > "$log"
NO_COLOR=1 "$KIRO" chat --v3 --no-interactive --trust-workspace --model "$model" "$@" "$(cat "$prompt")" 2>&1 \
  | tee -a "$log"
echo "# exit code: ${PIPESTATUS[0]}" >> "$log"
echo "# credits after run:" >> "$log"
NO_COLOR=1 "$KIRO" chat --no-interactive "/usage" 2>&1 | tee -a "$log"
echo "KIRO_RUN_DONE $log"
