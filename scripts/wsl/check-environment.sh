#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: check-environment.sh [--dry-run]"
  exit 0
fi
if [[ "${1:-}" == "--dry-run" ]]; then
  echo "Would verify user, Git, Python, jq, curl, workspace and Docker interop."
  exit 0
fi
[[ "$(id -un)" == "aiops" ]] || { echo "[DEGRADED] Expected aiops user."; exit 2; }
for command in git python3 jq curl unzip; do
  command -v "$command" >/dev/null || { echo "[OFFLINE] Missing $command."; exit 1; }
done
[[ -w /mnt/c/AI-Workspace/local-ai-orchestrator ]] ||
  { echo "[OFFLINE] Workspace is not writable."; exit 1; }
docker.exe info >/dev/null 2>&1 ||
  { echo "[DEGRADED] docker.exe interop unavailable."; exit 2; }
echo "[HEALTHY] WSL environment is ready."
