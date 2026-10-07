#!/bin/sh
# Runs on the deploy host after the git tree is extracted to /opt/costcap/src.
# Keeps /opt/costcap/.env and /opt/costcap/data. Rolls the image back if /health disagrees.
set -eu
SHA=${1:-}
case "$SHA" in
  *[!0-9a-f]*|"") echo "deploy: COSTCAP_GIT_SHA is not a commit" >&2; exit 2 ;;
esac
if [ ${#SHA} -ne 40 ]; then
  echo "deploy: COSTCAP_GIT_SHA is not a commit" >&2
  exit 2
fi
ROOT=/opt/costcap
cd "$ROOT/src"
set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a
export COSTCAP_GIT_SHA="$SHA"
if docker image inspect costcap:1 >/dev/null 2>&1; then
  docker tag costcap:1 costcap:previous
fi
docker compose -f compose.production.yaml -p costcap build
docker compose -f compose.production.yaml -p costcap up -d --no-build --force-recreate
i=0
while [ "$i" -lt 30 ]; do
  if docker exec costcap-costcap-1 node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/health").then(r=>r.json()).then(j=>{if(j.billing==="disabled"&&j.persistence==="single-process-file"&&j.sha===process.env.COSTCAP_GIT_SHA)process.exit(0);process.exit(1)}).catch(()=>process.exit(1))'; then
    echo "deploy: health sha matched"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done
echo "deploy: health readback failed; rolling back" >&2
if docker image inspect costcap:previous >/dev/null 2>&1; then
  docker tag costcap:previous costcap:1
  docker compose -f compose.production.yaml -p costcap up -d --no-build --force-recreate
fi
exit 1
