#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: backup-config.sh [--dry-run]"
  exit 0
fi
workspace='/mnt/c/AI-Workspace/local-ai-orchestrator'
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File \
  'C:\AI-Workspace\local-ai-orchestrator\scripts\windows\backup-config.ps1' "$@"
