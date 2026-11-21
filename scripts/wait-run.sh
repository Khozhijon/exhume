#!/bin/bash
# Block until the newest Kiro run with this label has finished, then print the end of its transcript.
# usage: scripts/wait-run.sh <label> [tail-lines]
cd "$(dirname "$0")/.."
label="$1"; lines="${2:-40}"
while :; do
  log=$(ls -t docs/kiro-sessions/ 2>/dev/null | grep -- "-${label}\.log$" | head -1)
  if [ -n "$log" ] && grep -q "^KIRO_RUN_DONE" "docs/kiro-sessions/$log"; then break; fi
  sleep 5
done
tail -n "$lines" "docs/kiro-sessions/$log" | cut -c1-400
