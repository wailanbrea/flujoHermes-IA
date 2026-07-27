#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: start-hermes.sh [Hermes arguments...]"
  exit 0
fi
workspace='C:\AI-Workspace\local-ai-orchestrator'
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File \
  "${workspace}\\scripts\\windows\\start-hermes-local.ps1" "$@"
