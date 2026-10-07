#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== setup: $(basename "$PWD") ==="
if   [ -f pnpm-lock.yaml ];    then PM=pnpm
elif [ -f package-lock.json ]; then PM=npm
elif [ -f yarn.lock ];         then PM=yarn
elif [ -f package.json ];      then PM=npm
else                                PM=""; fi
if [ -n "$PM" ]; then
  command -v "$PM" >/dev/null || { echo "$PM not installed; run workspace-admin bootstrap" >&2; exit 1; }
  echo "--> $PM install" && "$PM" install
fi
if [ -f requirements.txt ]; then python3 -m pip install -r requirements.txt; fi
grep -q "@playwright/test" package.json 2>/dev/null && npx playwright install chromium
[ -f prisma/schema.prisma ] && npx prisma generate
[ -f scripts/pull-secrets.sh ] && echo "note: run scripts/pull-secrets.sh to fetch .env.local"
echo "=== setup complete ==="
