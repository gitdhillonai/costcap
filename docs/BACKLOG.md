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
| #64 run-scope cap alert | P0 | closed on verify run 38337453183 | no |
| #65 agent silence on the worker | P1 | closed on verify run 38337453183 | no |
| #66 step budget loop alert | P0 | closed on verify run 38341631831 | no |
| #67 unconfigured alert channel | P1 | closed on verify run 38341631831 | no |
| #68 UTC spend windows | P0 | closed on verify run 38351282330 | no |
| #69 revoke clears alerts | P1 | closed on verify run 38351343242 | no |

Closed: #2, #3, #4, #7, #8, #9, #17, #18, #19, #20, #37, #38, #39, #40, #41, #46, #47, #48, #49, #50, #51, #52.

#40 and #41 are closed. Deploy run 37644183117 applied commit 28d2e87010ba27465db6417f55ed7d27e8e0b8fb and the canary passed. `GET /health` on the origin reports that sha. The workflow still exits 2 when the host or deploy key is missing. This is not production-ready. Billing stays disabled.

## Gap-analysis fixes (untracked by a GitHub issue)

- 2026-10-08: auth/request abuse-protection coverage. The signup endpoint
  `/auth/request` (#12) has two safety branches that the hosted-server tests
  never exercised: the per-IP rate limit (five turnstile-passing sends per hour,
  then `429`) that bounds both the metered code mailer and the brute-force
  surface, and the compensating rollback that deletes the half-created challenge
  and returns `503` when `sendCode` throws. A regression that dropped the rate
  check, flipped its `>=`, or let a send failure leave a dangling challenge (or
  surface a generic `500`) would have left every test green. Added two tests to
  `test/hosted-server.test.js`: five `200`s then a `429 /later/i`, and a
  send-failure path asserting `503 /unavailable/i`, no `challengeId` returned, an
  empty `challenges` map in the store, and recovery on the next request. Verified
  red on removing the rate-limit check and on removing the challenge rollback.
- 2026-10-08: cost-velocity enforcement proven through the proxy. The velocity
  circuit breaker (#8) is the headline runaway-spend protection, but only its
  isolated unit behavior (`test/velocity.test.js`) and the `step_budget` sibling
  path through the proxy (`test/cli.test.js`) were tested. The proxy's
  cost-velocity enforcement (that it feeds each call's real metered cost into the
  breaker and hard-stops the next upstream call once the spend rate spikes) had
  no end-to-end coverage, so a regression that fed the breaker the wrong cost,
  recorded on the wrong edge, or dropped the pre-call rate check would leave
  every test green while letting a cost runaway through. Added
  `test/velocity-proxy.test.js`: a baseline of cheap metered calls followed by a
  spike, asserting the follow-up call returns `429 breaker_open` with
  `reason: cost_velocity`, never reaches the provider, and writes a
  `cost_usd: 0` blocked receipt. Verified red on removing either the
  `velocity.record` feed or the pre-call `velocity.check` in `src/proxy.js`.
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
- 2026-10-08: loop-alert trip-reason coverage. The fleet `evaluateAlerts`
  (`src/hosted/alerts.js`) raises `loop_detected` on **either** shipped guardrail
  trip reason — `spiral_detected` (#7) or `cost_velocity` (#8) — but only the
  `spiral_detected` branch had a test. Dropping `cost_velocity` from the predicate
  left all tests green, so a refactor could have silently stopped paging the
  operator when the velocity breaker fires. Added a test in `test/hosted.test.js`
  that asserts a `cost_velocity` block raises `loop_detected` AND that an ordinary
  `budget_exceeded`/`killed` block does not (guarding against over-broadening the
  predicate so every capped run pages as a loop). Verified red on removing the
  `cost_velocity` branch, green on real code.
- 2026-10-12: fleet live spend. `/v1/fleet` now attaches `spend.day`, `spend.month`, and `spend.all` (`usd` plus `unknown`) per agent from synced receipts. A null `cost_usd` increments `unknown` and is excluded from `usd`. The workspace agent card shows UTC today and month figures and says they are not a provider bill. Covered by `test/hosted-server.test.js` and a UI script assertion in `test/ui.test.js`. Alert evaluation uses the same dollar totals.
- 2026-10-07: OpenRouter provider coverage. OpenRouter is a wired provider (in `PROVIDERS`, emitted as `OPENROUTER_BASE_URL` by `baseUrlOverrides`, listed in `docs/product-spec.md`) but had no behavioral test, while openai/anthropic/gemini each have usage-extraction fixtures. Added `test/openrouter.test.js`: `extractUsage` for OpenAI-shape OpenRouter responses (cached tokens + slashed model ids), the base-URL override, and a routed `/openrouter` metering + cap hard-stop that also exercises the unknown-model fallback rate. README enforcement-limits now lists OpenRouter among the fixture-tested providers.
