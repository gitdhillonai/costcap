# Backlog

GitHub issues are the source of truth. This file is the index as of 2026-10-07.

| Issue | Priority | State | Selectable |
|---|---|---|---|
| #1 CLI epic | P0 | open | no, waiting on #5 |
| #4 cap engine | P0 | closed on verify run 37635348252 | no |
| #5 npm publish | P1 | blocked on `NPM_TOKEN` | no |
| #6 loop epic | P0 | open | no, waiting on #1 |
| #7 retry spiral | P0 | closed on verify run 37635348252 | no |
| #8 velocity and steps | P0 | closed on verify run 37635348252 | no |
| #9 kill switch | P0 | closed on verify run 37635348252 | no |
| #10 dogfood | P2 | blocked on 14 days of authorized receipts | no |
| #11 hosted epic | P0 | open | no |
| #12 org auth | P0 | blocked on live Turnstile and Brevo proof | no |
| #13 enrollment sync | P0 | blocked on a deployed origin | no |
| #14 Brevo and Slack alerts | P0 | blocked on an authorized live send | no |
| #15 distribution epic | P2 | blocked on publish and marketplace access | no |
| #16 OCE substrate | P2 | blocked, re-scoped to a later adapter | no |
| #37 CI security gates | P0 | closed on verify run 37634321530 | no |
| #38 Playwright E2E | P0 | closed on verify run 37635087734 | no |
| #39 request logs | P1 | closed on verify run 37635348252 | no |
| #40 IaC deploy | P1 | closed on deploy run 37644183117 | no |
| #41 deploy canary | P1 | closed on deploy run 37644183117 | no |
| #42 Postgres | P2 | blocked on an IaC-managed database | no |
| #43 billing disabled | P2 | blocked on Stripe readback; charging stays off | no |
| #44 costcap.dev DNS | P2 | blocked on DNS credentials | no |
| #45 live login and alert CI | P1 | blocked on production secrets | no |
| #46 Compose deploy gate | P0 | closed on verify run 37637693974 | no |
| #47 npm pack gate | P0 | closed on verify run 37638206551 | no |
| #48 canary command | P0 | closed on verify run 37638496816 | no |
| #49 Postgres migrations in CI | P1 | closed on verify run 37638742657 | no |
| #50 billing guard | P1 | closed on verify run 37640489524 | no |
| #51 DNS fail-closed workflow | P2 | closed on verify run 37640713639 | no |
| #52 live-proof shell | P2 | closed on verify run 37640949670 | no |

Closed: #2, #3, #4, #7, #8, #9, #17, #18, #19, #20, #37, #38, #39, #40, #41, #46, #47, #48, #49, #50, #51, #52.

#40 and #41 are closed. Deploy run 37644183117 applied commit 28d2e87010ba27465db6417f55ed7d27e8e0b8fb and the canary passed. `GET /health` on the origin reports that sha. The workflow still exits 2 when the host or deploy key is missing. This is not production-ready. Billing stays disabled.

## Gap-analysis fixes (untracked by a GitHub issue)

- 2026-10-07: version source-of-truth. `/health` reported a hardcoded `version: "0.0.1"` that would drift from `package.json` on the next bump. Now both the hosted `/health` endpoint and the CLI read the version from `package.json` via `src/version.js`. Added `costcap --version`/`-v` and `--help`/`-h` (plus no-args usage). Covered by `test/hosted-server.test.js` and `test/cli.test.js`.
- 2026-10-08: reconcile duplicate/empty receipt id. `reconcile()` threw on a
  duplicate *provider charge* id but silently absorbed a duplicate *receipt* id —
  the second occurrence was reported as a `receipt_only` gap while the first still
  counted as `matched`, so the same id appeared in two buckets of an
  accounting-integrity report. A repeated receipt id signals ledger corruption and
  must fail loudly, symmetric with the charge-side guard. Now throws
  `Duplicate receipt id`, and the receipt-id check also rejects an empty string
  (matching the charge side). Covered by `test/reconcile.test.js` (goes red on the
  prior `src/reconcile.js`).
- 2026-10-07: OpenRouter provider coverage. OpenRouter is a wired provider (in `PROVIDERS`, emitted as `OPENROUTER_BASE_URL` by `baseUrlOverrides`, listed in `docs/product-spec.md`) but had no behavioral test, while openai/anthropic/gemini each have usage-extraction fixtures. Added `test/openrouter.test.js`: `extractUsage` for OpenAI-shape OpenRouter responses (cached tokens + slashed model ids), the base-URL override, and a routed `/openrouter` metering + cap hard-stop that also exercises the unknown-model fallback rate. README enforcement-limits now lists OpenRouter among the fixture-tested providers.
