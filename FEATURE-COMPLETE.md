# Feature completion

Generated 2026-10-11T17:16:58.731Z by `node scripts/feature-complete.mjs`.
Test process exit 1. Passed names: 132. Failed names: compose config fails closed without required variables; compose config renders one replica and a data volume for uid 1000; production compose is one replica on the existing data directory; postgres migrations apply and roll back without changing the running store.
DONE means COSTCAP_CI_RUN names a finished green GitHub run and the live curl matched. TESTED means the named test passed. BLOCKED is not done.

| feature | status | test | evidence |
|---|---|---|---|
| CLI wrap run cap | FAIL | wrap points the child at the proxy and the cap hard-stops the second call | node --test matched "wrap points the child at the proxy and the cap hard-stops the second call"; CI 38109298845 |
| CLI day cap | FAIL | wrap enforces day-cap and month-cap from the CLI | node --test matched "wrap enforces day-cap and month-cap from the CLI"; CI 38109298845 |
| CLI month cap | FAIL | wrap enforces day-cap and month-cap from the CLI | node --test matched "wrap enforces day-cap and month-cap from the CLI"; CI 38109298845 |
| CLI max steps | FAIL | wrap --max-steps 2 lets two calls through and breaks the third with breaker_open | node --test matched "wrap --max-steps 2 lets two calls through and breaks the third with breaker_open"; CI 38109298845 |
| Retry-pattern detection | FAIL | retry spiral: identical request past the threshold gets 429 spiral_detected and never reaches upstream | node --test matched "retry spiral: identical request past the threshold gets 429 spiral_detected and never reaches upstream"; CI 38109298845 |
| Cost-velocity breaker | FAIL | a 10x spike after a baseline trips and latches | node --test matched "a 10x spike after a baseline trips and latches"; CI 38109298845 |
| Local kill and resume | FAIL | kill writes the file, check sees it, resume clears it | node --test matched "kill writes the file, check sees it, resume clears it"; CI 38109298845 |
| Kill file is cwd-relative | FAIL | default kill file is relative to the working directory | node --test matched "default kill file is relative to the working directory"; CI 38109298845 |
| SIGKILL after 5 seconds | FAIL | wrap sends SIGKILL after 5 seconds when the child ignores SIGTERM | node --test matched "wrap sends SIGKILL after 5 seconds when the child ignores SIGTERM"; CI 38109298845 |
| Unknown cost stays null | FAIL | missing usage is stored as null and blocks the next call | node --test matched "missing usage is stored as null and blocks the next call"; CI 38109298845 |
| Check does not count unknown cost as zero | FAIL | CI budget checks fail closed for unknown, malformed or missing evidence | node --test matched "CI budget checks fail closed for unknown, malformed or missing evidence"; CI 38109298845 |
| SSE buffered metering for OpenAI, Anthropic and Gemini | FAIL | SSE fixtures for OpenAI, Anthropic and Gemini are buffered then metered | node --test matched "SSE fixtures for OpenAI, Anthropic and Gemini are buffered then metered"; CI 38109298845 |
| Versioned pricing table | FAIL | known model returns its table entry with version pinned | node --test matched "known model returns its table entry with version pinned"; CI 38109298845 |
| Unknown model uses declared fallback | FAIL | unknown model bills at declared fallback, flagged, never free | node --test matched "unknown model bills at declared fallback, flagged, never free"; CI 38109298845 |
| Anthropic cache creation at input rate | FAIL | Anthropic cache creation is priced at the input rate | node --test matched "Anthropic cache creation is priced at the input rate"; CI 38109298845 |
| One accepted call can exceed the remaining cap | FAIL | a metered call can exceed the remaining run cap and the next call does not | node --test matched "a metered call can exceed the remaining run cap and the next call does not"; CI 38109298845 |
| Requests are serialized in one proxy | FAIL | proxy serializes upstream calls | node --test matched "proxy serializes upstream calls"; CI 38109298845 |
| Ledger lock survives a stopped wrapper | FAIL | a lock left by a stopped wrapper is kept until it is removed | node --test matched "a lock left by a stopped wrapper is kept until it is removed"; CI 38109298845 |
| Separate ledgers do not share caps | FAIL | separate ledgers do not share day or month caps | node --test matched "separate ledgers do not share day or month caps"; CI 38109298845 |
| UTC day and month windows | FAIL | day and month windows use UTC dates | node --test matched "day and month windows use UTC dates"; CI 38109298845 |
| Proxy binds to 127.0.0.1 | FAIL | metering proxy binds to 127.0.0.1 | node --test matched "metering proxy binds to 127.0.0.1"; CI 38109298845 |
| Enroll client | FAIL | enrollment requires secure origin, validates cache and keeps credentials private | node --test matched "enrollment requires secure origin, validates cache and keeps credentials private"; CI 38109298845 |
| Policy and receipt sync with offline cache | FAIL | policy updates, cache, receipt acknowledgments and offline behavior | node --test matched "policy updates, cache, receipt acknowledgments and offline behavior"; CI 38109298845 |
| Wrapper cannot loosen a cached policy | FAIL | wrapper cannot loosen a cached fleet policy | node --test matched "wrapper cannot loosen a cached fleet policy"; CI 38109298845 |
| check command | FAIL | check command exits 0 under, 1 at cap, 2 for absent evidence | node --test matched "check command exits 0 under, 1 at cap, 2 for absent evidence"; CI 38109298845 |
| Composite GitHub Action | FAIL | composite action runs the local check command | node --test matched "composite action runs the local check command"; CI 38109298845 |
| Local MCP budget_status | FAIL | MCP supports initialize, tool listing and read-only budget status | node --test matched "MCP supports initialize, tool listing and read-only budget status"; CI 38109298845 |
| Hosted health route | FAIL | billing stays disabled and there is no charge route | node --test matched "billing stays disabled and there is no charge route"; GET https://app.costcap.dev/health 200 {"status":"ok","product":"CostCap","beta":true,"billing":"enabled","persistence":"single-process-file","version":"0.0.1","sha":"4a76eec2ccc4957315e02a3600b475ef6223235d"}; CI 38109298845 |
| Billing disabled | FAIL | billing stays disabled and there is no charge route | node --test matched "billing stays disabled and there is no charge route"; GET /health billing=enabled; GET / contains Billing is disabled=false; POST /billing with origin returned 404; CI 38109298845 |
| Hosted UI shell | FAIL | same-origin UI assets use CSP and no inline scripts or data HTML injection | node --test matched "same-origin UI assets use CSP and no inline scripts or data HTML injection"; GET / 200; FREE BETA=true; GET /ui/config 200 keys=siteKey; CI 38109298845 |
| Org-scoped fleet API | FAIL | verified org-first login, tenant isolation, enrollment, receipt sync and restart | node --test matched "verified org-first login, tenant isolation, enrollment, receipt sync and restart"; CI 38109298845 |
| Brevo mail adapter | FAIL | Brevo sends proper auth, addresses and escaped HTML | node --test matched "Brevo sends proper auth, addresses and escaped HTML"; CI 38109298845 |
| Slack webhook adapter | FAIL | invalid webhook origins are rejected before delivery | node --test matched "invalid webhook origins are rejected before delivery"; CI 38109298845 |
| Alert rules | FAIL | alerts: approaching, hit, loop, silent | node --test matched "alerts: approaching, hit, loop, silent"; CI 38109298845 |
| Single-process JSON datastore | FAIL | durable transactions roll back on failure and reopen without loss | node --test matched "durable transactions roll back on failure and reopen without loss"; live persistence=single-process-file; CI 38109298845 |
| Runaway acceptance command | TESTED | acceptance file | docs/verification/2026-10-06-runaway.json checkedAt 2026-10-06T17:25:08.841Z; paidCalls 0; scenarios cap, retry-spiral, steps, day-cap, month-cap, unknown-cost, kill-file; CI 38109298845 |
| Organization invitations | FAIL | an invitation joins that org and a viewer cannot change policy or invite | node --test matched "an invitation joins that org and a viewer cannot change policy or invite"; CI 38109298845 |
| Receipt and provider charge reconciliation | FAIL | reconciliation does not treat unknown or missing provider cost as zero | node --test matched "reconciliation does not treat unknown or missing provider cost as zero"; CI 38109298845 |
| Live email-code login | BLOCKED |  | TURNSTILE_SECRET_KEY and a Brevo inbox were not used. This run did not submit a live challenge or read a mailbox. |
| Live alert delivery | BLOCKED |  | BREVO_API_KEY and an authorized COSTCAP_ALERT_ORG_ID recipient were not used. No live mail or Slack message was sent. |
| Postgres datastore | BLOCKED |  | No Postgres instance is provisioned for this beta. Live /health reports persistence single-process-file. |
| Live provider charge download | BLOCKED |  | No provider billing API credential is configured. costcap reconcile reads a local charge file only. |
| Paid billing | BLOCKED |  | Billing is disabled. No Stripe secret is configured. POST /billing on the live host is not a checkout. |
| npm publication | BLOCKED |  | npm publish was not run. |
| GitHub Marketplace listing | BLOCKED |  | No marketplace release was published. |
| Provider-bill reconciliation | BLOCKED |  | No provider billing credential was available. Receipts are estimates. |
| Two-week fleet dogfood | BLOCKED |  | No two-week authorized receipt archive was produced. |
| costcap.dev apex site | BLOCKED |  | TLS request failed: HTTP 200. No DNS or certificate change was made. |

## Live curl

```json
{
  "observedAt": "2026-10-11T17:16:58.731Z",
  "healthStatus": 200,
  "health": {
    "status": "ok",
    "product": "CostCap",
    "beta": true,
    "billing": "enabled",
    "persistence": "single-process-file",
    "version": "0.0.1",
    "sha": "4a76eec2ccc4957315e02a3600b475ef6223235d"
  },
  "rootStatus": 200,
  "rootHasBillingDisabled": false,
  "rootHasFreeBeta": true,
  "rootHasFleet": true,
  "configStatus": 200,
  "configHasSiteKey": true,
  "configKeys": [
    "siteKey"
  ],
  "fleetStatus": 401,
  "billingStatus": 404,
  "apexStatus": 200
}
```
