#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: check-lm-studio.sh"
  exit 0
fi
payload="$(curl --fail --silent --max-time 4 http://127.0.0.1:1234/api/v1/models)" ||
  { echo "[OFFLINE] LM Studio unavailable."; exit 1; }
loaded="$(jq '[.models[].loaded_instances[]] | length' <<<"$payload")"
[[ "$loaded" -gt 0 ]] ||
  { echo "[DEGRADED] Server active without a loaded model."; exit 2; }
jq -e '[.models[].loaded_instances[] |
  select(.config.context_length >= 65536 and .config.parallel == 1)] |
  length > 0' <<<"$payload" >/dev/null ||
  { echo "[DEGRADED] Model limits are not 64K/parallel 1."; exit 2; }
echo "[HEALTHY] LM Studio model limits are safe."
