#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: stop-hermes.sh [--dry-run]"
  exit 0
fi
if [[ "${1:-}" == "--dry-run" ]]; then
  echo "Would unload only the workspace Hermes model."
  exit 0
fi
model='qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive'
if lms.exe ps --json | jq -e --arg model "$model" \
  '.[] | select(.modelKey == $model)' >/dev/null; then
  lms.exe unload "$model"
fi
