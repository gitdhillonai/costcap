#!/usr/bin/env bash
# Local convenience wrapper — forwards to the canonical workspace mapping.
set -euo pipefail
WA="$HOME/projects/workspace-admin"
if [ -f "$WA/maintenance/pull-secrets.sh" ]; then
  bash "$WA/maintenance/pull-secrets.sh" "$@"
else
  echo "workspace-admin not found at $WA; clone it first" >&2; exit 1
fi
