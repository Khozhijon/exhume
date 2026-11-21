#!/bin/bash
# Diagnostic: one tiny headless run with machine-readable output, to see what usage data Kiro reports.
cd "$(dirname "$0")/.."
NO_COLOR=1 "$HOME/.local/bin/kiro-cli" chat --v3 --no-interactive --trust-workspace --model "${1:-qwen3-coder-next}" \
  --agent gravedigger --output-format stream-json "Reply with the single word: ready" \
  > /tmp/claude-501/kiro-inst/stream-probe.json 2>&1
echo "exit $?"; wc -c /tmp/claude-501/kiro-inst/stream-probe.json
