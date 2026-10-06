# Feature completion

Generated 2026-10-06T20:03:15.622Z by `node scripts/feature-complete.mjs`.
Test process exit 0. Passed names: 93. Failed names: none.
DONE means COSTCAP_CI_RUN names a finished green GitHub run and the live curl matched. TESTED means the named test passed. BLOCKED is not done.

| feature | status | test | evidence |
|---|---|---|---|
| CLI wrap run cap | TESTED | wrap points the child at the proxy and the cap hard-stops the second call | node --test matched "wrap points the child at the proxy and the cap hard-stops the second call"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| CLI day cap | TESTED | wrap enforces day-cap and month-cap from the CLI | node --test matched "wrap enforces day-cap and month-cap from the CLI"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| CLI month cap | TESTED | wrap enforces day-cap and month-cap from the CLI | node --test matched "wrap enforces day-cap and month-cap from the CLI"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| CLI max steps | TESTED | wrap --max-steps 2 lets two calls through and breaks the third with breaker_open | node --test matched "wrap --max-steps 2 lets two calls through and breaks the third with breaker_open"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Retry-pattern detection | TESTED | retry spiral: identical request past the threshold gets 429 spiral_detected and never reaches upstream | node --test matched "retry spiral: identical request past the threshold gets 429 spiral_detected and never reaches upstream"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Cost-velocity breaker | TESTED | a 10x spike after a baseline trips and latches | node --test matched "a 10x spike after a baseline trips and latches"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Local kill and resume | TESTED | kill writes the file, check sees it, resume clears it | node --test matched "kill writes the file, check sees it, resume clears it"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Kill file is cwd-relative | TESTED | default kill file is relative to the working directory | node --test matched "default kill file is relative to the working directory"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| SIGKILL after 5 seconds | TESTED | wrap sends SIGKILL after 5 seconds when the child ignores SIGTERM | node --test matched "wrap sends SIGKILL after 5 seconds when the child ignores SIGTERM"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Unknown cost stays null | TESTED | missing usage is stored as null and blocks the next call | node --test matched "missing usage is stored as null and blocks the next call"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Check does not count unknown cost as zero | TESTED | CI budget checks fail closed for unknown, malformed or missing evidence | node --test matched "CI budget checks fail closed for unknown, malformed or missing evidence"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| SSE buffered metering for OpenAI, Anthropic and Gemini | TESTED | SSE fixtures for OpenAI, Anthropic and Gemini are buffered then metered | node --test matched "SSE fixtures for OpenAI, Anthropic and Gemini are buffered then metered"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Versioned pricing table | TESTED | known model returns its table entry with version pinned | node --test matched "known model returns its table entry with version pinned"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Unknown model uses declared fallback | TESTED | unknown model bills at declared fallback, flagged, never free | node --test matched "unknown model bills at declared fallback, flagged, never free"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Anthropic cache creation at input rate | TESTED | Anthropic cache creation is priced at the input rate | node --test matched "Anthropic cache creation is priced at the input rate"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| One accepted call can exceed the remaining cap | TESTED | a metered call can exceed the remaining run cap and the next call does not | node --test matched "a metered call can exceed the remaining run cap and the next call does not"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Requests are serialized in one proxy | TESTED | proxy serializes upstream calls | node --test matched "proxy serializes upstream calls"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Ledger lock survives a stopped wrapper | TESTED | a lock left by a stopped wrapper is kept until it is removed | node --test matched "a lock left by a stopped wrapper is kept until it is removed"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Separate ledgers do not share caps | TESTED | separate ledgers do not share day or month caps | node --test matched "separate ledgers do not share day or month caps"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| UTC day and month windows | TESTED | day and month windows use UTC dates | node --test matched "day and month windows use UTC dates"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Proxy binds to 127.0.0.1 | TESTED | metering proxy binds to 127.0.0.1 | node --test matched "metering proxy binds to 127.0.0.1"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Enroll client | TESTED | enrollment requires secure origin, validates cache and keeps credentials private | node --test matched "enrollment requires secure origin, validates cache and keeps credentials private"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Policy and receipt sync with offline cache | TESTED | policy updates, cache, receipt acknowledgments and offline behavior | node --test matched "policy updates, cache, receipt acknowledgments and offline behavior"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Wrapper cannot loosen a cached policy | TESTED | wrapper cannot loosen a cached fleet policy | node --test matched "wrapper cannot loosen a cached fleet policy"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| check command | TESTED | check command exits 0 under, 1 at cap, 2 for absent evidence | node --test matched "check command exits 0 under, 1 at cap, 2 for absent evidence"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Composite GitHub Action | TESTED | composite action runs the local check command | node --test matched "composite action runs the local check command"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Local MCP budget_status | TESTED | MCP supports initialize, tool listing and read-only budget status | node --test matched "MCP supports initialize, tool listing and read-only budget status"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Hosted health route | DONE | billing stays disabled and there is no charge route | node --test matched "billing stays disabled and there is no charge route"; GET https://app.costcap.dev/health 200 {"status":"ok","product":"CostCap","beta":true,"billing":"disabled","persistence":"single-process-file","version":"0.0.1"}; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Billing disabled | DONE | billing stays disabled and there is no charge route | node --test matched "billing stays disabled and there is no charge route"; GET /health billing=disabled; GET / contains Billing is disabled=true; POST /billing with origin returned 404; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Hosted UI shell | DONE | same-origin UI assets use CSP and no inline scripts or data HTML injection | node --test matched "same-origin UI assets use CSP and no inline scripts or data HTML injection"; GET / 200; FREE BETA=true; GET /ui/config 200 keys=siteKey; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Org-scoped fleet API | TESTED | verified org-first login, tenant isolation, enrollment, receipt sync and restart | node --test matched "verified org-first login, tenant isolation, enrollment, receipt sync and restart"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Brevo mail adapter | TESTED | Brevo sends proper auth, addresses and escaped HTML | node --test matched "Brevo sends proper auth, addresses and escaped HTML"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Slack webhook adapter | TESTED | invalid webhook origins are rejected before delivery | node --test matched "invalid webhook origins are rejected before delivery"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Alert rules | TESTED | alerts: approaching, hit, loop, silent | node --test matched "alerts: approaching, hit, loop, silent"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Single-process JSON datastore | DONE | durable transactions roll back on failure and reopen without loss | node --test matched "durable transactions roll back on failure and reopen without loss"; live persistence=single-process-file; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Runaway acceptance command | TESTED | acceptance file | docs/verification/2026-10-06-runaway.json checkedAt 2026-10-06T17:25:08.841Z; paidCalls 0; scenarios cap, retry-spiral, steps, day-cap, month-cap, unknown-cost, kill-file; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Organization invitations | TESTED | an invitation joins that org and a viewer cannot change policy or invite | node --test matched "an invitation joins that org and a viewer cannot change policy or invite"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Receipt and provider charge reconciliation | TESTED | reconciliation does not treat unknown or missing provider cost as zero | node --test matched "reconciliation does not treat unknown or missing provider cost as zero"; CI https://github.com/gitdhillonai/costcap/actions/runs/37523405477 |
| Live email-code login | BLOCKED |  | TURNSTILE_SECRET_KEY and a Brevo inbox were not used. This run did not submit a live challenge or read a mailbox. |
| Live alert delivery | BLOCKED |  | BREVO_API_KEY and an authorized COSTCAP_ALERT_ORG_ID recipient were not used. No live mail or Slack message was sent. |
| Postgres datastore | BLOCKED |  | No Postgres instance is provisioned for this beta. Live /health reports persistence single-process-file. |
| Live provider charge download | BLOCKED |  | No provider billing API credential is configured. costcap reconcile reads a local charge file only. |
| Paid billing | BLOCKED |  | Billing is disabled. No Stripe secret is configured. POST /billing on the live host is not a checkout. |
| npm publication | BLOCKED |  | npm publish was not run. |
| GitHub Marketplace listing | BLOCKED |  | No marketplace release was published. |
| Provider-bill reconciliation | BLOCKED |  | No provider billing credential was available. Receipts are estimates. |
| Two-week fleet dogfood | BLOCKED |  | No two-week authorized receipt archive was produced. |
| costcap.dev apex site | BLOCKED |  | TLS request failed: Client network socket disconnected before secure TLS connection was established. No DNS or certificate change was made. |

## Live curl

```json
{
  "observedAt": "2026-10-06T20:03:15.622Z",
  "healthStatus": 200,
  "health": {
    "status": "ok",
    "product": "CostCap",
    "beta": true,
    "billing": "disabled",
    "persistence": "single-process-file",
    "version": "0.0.1"
  },
  "rootStatus": 200,
  "rootHasBillingDisabled": true,
  "rootHasFreeBeta": true,
  "rootHasFleet": true,
  "configStatus": 200,
  "configHasSiteKey": true,
  "configKeys": [
    "siteKey"
  ],
  "fleetStatus": 401,
  "billingStatus": 404,
  "apexError": "Client network socket disconnected before secure TLS connection was established"
}
```
