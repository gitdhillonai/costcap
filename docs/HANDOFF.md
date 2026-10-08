# Handoff: costcap

**State:** CLI core, loop/kill guardrails, and the hosted free-beta service are
implemented and tested locally (`npm test` green, 115 tests on 2026-10-07). This
is NOT the Phase-0 shell the earlier handoff described; the product is built. The
remaining open issues are blocked on **owner residue only** (npm publish token,
live Turnstile/Brevo proof, a deployed origin, DNS credentials, Stripe readback,
an IaC-managed Postgres). See the Owner enablement queue below.

**Next action:** continue the final gap-analysis loop in
`docs/AUTONOMOUS_EXECUTION_PROMPT.md` — re-audit code vs `docs/BACKLOG.md` and
`docs/ARCHITECTURE.md` for untested paths and doc-vs-code drift, turn each into a
small tested unit, and stop at the cap for owner review. Do not perform any
Parked-residue action.

**Last tick (2026-10-07):** gap-analysis fix — the product version is now read
from `package.json` via `src/version.js` and consumed by both the hosted
`/health` endpoint (previously a hardcoded `"0.0.1"` that would drift) and the
CLI. Added top-level `costcap --version`/`-v` and `--help`/`-h` (and no-args
usage). Covered by `test/hosted-server.test.js` (health version equals
package.json) and `test/cli.test.js` (version/help/unknown-command).

**Verify / resume:**
```bash
cd ~/projects/costcap && npm test
```

**Owner enablement queue (residue — needs the owner, blocks only final go-live):**
- `NPM_TOKEN` to publish `costcap` (unblocks #5, then #1).
- A deployed origin + live Cloudflare Turnstile keys + authorized Brevo send to
  prove #12/#13/#14 end-to-end (engineering is done locally).
- DNS credentials for `costcap.dev` (#44) and TLS through IaC.
- Stripe readback before any billing is enabled (#43); charging stays OFF.
- An IaC-managed Postgres with separate migration/application roles (#42).
