# Handoff: costcap

**State:** CLI core, loop/kill guardrails, and the hosted free-beta service are
implemented and tested locally (`npm test` green, 123 tests on 2026-10-08). This
is NOT the Phase-0 shell the earlier handoff described; the product is built. The
remaining open issues are blocked on **owner residue only** (npm publish token,
live Turnstile/Brevo proof, a deployed origin, DNS credentials, Stripe readback,
an IaC-managed Postgres). See the Owner enablement queue below.

**Next action:** continue the final gap-analysis loop in
`docs/AUTONOMOUS_EXECUTION_PROMPT.md` — re-audit code vs `docs/BACKLOG.md` and
`docs/ARCHITECTURE.md` for untested paths and doc-vs-code drift, turn each into a
small tested unit, and stop at the cap for owner review. Do not perform any
Parked-residue action.

**Last tick (2026-10-08):** gap-analysis fix. Covered two untested
abuse-protection branches on `/auth/request` (#12). The per-IP rate limit (five
turnstile-passing sends per hour, then `429`) and the `sendCode`-failure rollback
(delete the half-created challenge, return `503`) had no test, so a dropped rate
check or a lost rollback would have passed CI. Added two tests to
`test/hosted-server.test.js` (five `200`s then `429`; a send failure returning
`503` with no `challengeId`, an empty `challenges` map, and recovery on retry).
`npm test` green (123 tests) on the pinned node 22; verified red on removing the
rate-limit check and on removing the challenge rollback.

**Prior tick (2026-10-08):** gap-analysis fix. Proved the cost-velocity breaker
(#8) enforces through the proxy, not just in isolation. The breaker's unit
behavior and the `step_budget` sibling path (via the CLI) were tested, but the
proxy's cost-velocity enforcement (feeding each call's real metered cost into the
breaker and hard-stopping the next upstream call on a spend-rate spike) had no
end-to-end coverage. Added `test/velocity-proxy.test.js`: a cheap baseline then a
spike, asserting the follow-up call returns `429 breaker_open` with
`reason: cost_velocity`, never reaches the provider, and writes a `cost_usd: 0`
blocked receipt. `npm test` green (121 tests) on the pinned node 22. Verified red
on removing either the `velocity.record` feed or the pre-call `velocity.check` in
`src/proxy.js`.

**Earlier tick (2026-10-08):** gap-analysis fix — closed a loop-alert coverage
asymmetry. The fleet `evaluateAlerts` raises `loop_detected` on either
`spiral_detected` (#7) or `cost_velocity` (#8), but only the spiral branch was
tested, so a refactor could silently stop paging on a velocity-breaker trip.
Added a `test/hosted.test.js` test asserting a `cost_velocity` block raises
`loop_detected` and a plain `budget_exceeded`/`killed` block does not. Verified
red on removing the `cost_velocity` branch.

**Earlier still (2026-10-08):** gap-analysis fix — closed a reconcile asymmetry.
`reconcile()` threw on a duplicate provider-charge id but silently split a
duplicate receipt id across `matched` and `receipt_only`, producing an incoherent
accounting-integrity report. Now a repeated (or empty) receipt id throws, matching
the charge-side guard. Covered by `test/reconcile.test.js` (verified red on the
prior `src/reconcile.js`).

**Earlier still (2026-10-07):** gap-analysis fix — closed the OpenRouter coverage
gap. OpenRouter is wired as a provider and emitted as `OPENROUTER_BASE_URL` but
had no behavioral test, unlike the other three providers. Added
`test/openrouter.test.js` covering OpenAI-shape usage extraction (cached tokens,
slashed model ids), the base-URL override, and a routed `/openrouter` metering +
cap hard-stop that exercises the unknown-model fallback rate. README
enforcement-limits now lists OpenRouter among the fixture-tested providers.

**Oldest noted (2026-10-07):** version source-of-truth — the product version is
read from `package.json` via `src/version.js` and consumed by both the hosted
`/health` endpoint and the CLI; added `--version`/`--help`.

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
