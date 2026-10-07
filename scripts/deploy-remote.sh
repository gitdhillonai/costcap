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
# Quote every value. The host file can contain an address like Name <box@domain>, which is not valid to source.
python3 - "$ROOT/.env" <<'PY'
import pathlib, shlex, sys
need = ["COSTCAP_ORIGIN", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "BREVO_API_KEY", "COSTCAP_EMAIL_FROM", "COSTCAP_EMAIL_PROVIDER"]
have = {}
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
    key, value = stripped.split("=", 1)
    have[key] = value
missing = [key for key in need if not have.get(key)]
if missing:
    print("deploy: missing " + ", ".join(missing), file=sys.stderr)
    raise SystemExit(2)
if have["COSTCAP_EMAIL_PROVIDER"] != "brevo":
    print("deploy: COSTCAP_EMAIL_PROVIDER must be brevo", file=sys.stderr)
    raise SystemExit(2)
if not have["COSTCAP_ORIGIN"].startswith("https://"):
    print("deploy: COSTCAP_ORIGIN must be https", file=sys.stderr)
    raise SystemExit(2)
lines = [f"export {key}={shlex.quote(have[key])}" for key in need]
pathlib.Path("/tmp/costcap-env.sh").write_text("\n".join(lines) + "\n")
PY
set -a
# shellcheck disable=SC1091
. /tmp/costcap-env.sh
set +a
rm -f /tmp/costcap-env.sh
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
