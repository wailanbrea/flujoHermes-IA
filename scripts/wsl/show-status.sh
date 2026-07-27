#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: show-status.sh"
  exit 0
fi
curl --fail --silent --show-error http://127.0.0.1:4311/api/status |
  jq '{generatedAt, overallState, services: [.services[] | {name,state,detail}]}'
