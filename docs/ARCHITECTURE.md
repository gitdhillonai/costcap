# CostCap: architecture

As-built on `main` as of 2026-10-14 (`46857ac`). `npm test` is green (158 tests,
0 fail). This is a description of what runs, not a certification of deployment,
payment, or review readiness. Main-branch documents are evidence, not
authorization for side effects. Companion: [PATH_TO_FIRST_DOLLAR.md](PATH_TO_FIRST_DOLLAR.md).

## What CostCap is

Local spend guardrails for proxy-routed AI requests, plus an optional hosted
fleet view. The free CLI is the shipping product; the hosted beta is built but
not yet cut over to a public name. Guardrails, not guarantees — only
proxy-routed traffic is controlled, and receipt-based caps can overshoot by one
accepted request.

## Stack

| Piece | Choice |
|---|---|
| Language | JavaScript ESM (`"type": "module"`), **no runtime dependencies** |
| Runtime | Node.js 20+ (image is `node:22-alpine`) |
| CLI | `src/cli.js` (`costcap` bin, shebanged): `wrap`, `kill`, `resume`, `check`, `mcp`, `enroll`, `reconcile` |
| Local proxy | `src/proxy.js`, binds `127.0.0.1`; serializes upstream calls |
| Guardrail engines | `src/cap.js`, `src/spiral.js`, `src/velocity.js`, `src/kill.js`, `src/ledger-lock.js` |
| Pricing | `src/pricing-table.json` (versioned estimate) + `src/pricing.js` |
| Providers metered | openai, anthropic, openrouter, gemini (base-URL override, `src/proxy.js`) |
| Hosted process | `src/hosted/server.js` (node:http), started by `src/hosted/run.js` / `npm start` |
| Store | Single-process JSON file (`src/hosted/store.js`), `0600`, atomic temp-rename, one synchronous transaction at a time |
| Auth | Email-code login + Cloudflare Turnstile; org-first; HttpOnly SameSite=Strict session cookie |
| Mail | Brevo adapter, only when `COSTCAP_EMAIL_PROVIDER=brevo` and secrets are set |
| Alerts | `src/hosted/alerts.js` + Brevo/Slack delivery (`src/hosted/delivery.js`) |
| Billing | **Disabled by default.** Live path requires a $19/mo Stripe readback; a test-mode path (`COSTCAP_STRIPE_MODE=test`, `sk_test_` only) is wired. No price is created or edited by this repo. |
| Deploy | Coolify on the existing Hetzner box (Path A) on push to `main` (`compose.production.yaml`) |
| Postgres | Migrations exist under `db/migrations/` and are proven in CI only; production stays on the JSON store until `/health` reports a database backend |

## Request-surface boundary

```text
Local (free, shipping):
  set caps -> `costcap wrap -- <agent>` -> local proxy (127.0.0.1)
    -> metered upstream call -> receipt ledger (locked per wrapper)
    -> cap / spiral / velocity / step / kill checks hard-stop the next call
  `costcap check` (CI / action.yml) and `costcap mcp` read the ledger read-only.

Hosted (beta, not cut over):
  browser --TLS--> app/auth boundary (Turnstile + email code, org-scoped session)
    -> tenant-filtered JSON store (orgs/users/agents/receipts/alerts/audit)
  enrolled agent --Bearer token--> /v1/policy, /v1/receipts (org-scoped)
```

Trust-boundary invariants (the moat — each is tested):

- **Tenant isolation** on every hosted read/write: `/v1/fleet`, `/v1/receipts.csv`,
  alerts, and audit are filtered to the session user's `orgId`; an agent bearer
  token is not a browser session. Company membership is never inferred from an
  email domain.
- **Credentials never cross the boundary.** The proxy writes no request bodies or
  authorization headers into receipts. `/ui/config` returns only the public
  Turnstile site key. `/health` and `/api/health/stripe` return booleans/shape
  only — never a key, webhook secret, account id, or price id.
- **Fail-closed accounting.** Missing/invalid usage stores `cost_usd: null`,
  counts as *unknown* (never `$0`), and blocks restart until reconciled. Unknown
  models bill at the declared fallback rate — flagged, never free.
- **Readback, not redirect, is payment evidence.** A `livemode`/scope mismatch, an
  unverified Stripe object, or a zero-amount invoice never grants a plan.
- **Deploy fail-closed.** The deploy workflow exits without applying when host,
  SSH key, or git SHA are absent; a failed Stripe readback at boot keeps the app
  up with billing disabled.

## Data model

Hosted JSON store (`version: 1`): `orgs`, `users`, `sessions`, `challenges`,
`enrollments`, `agents`, `receipts`, `invitations`, `alerts`, `audit`,
`billingEvents`. All tenant-owned rows carry `orgId`.

Planned Postgres (`db/migrations/`, CI-proven only): `orgs` + `users` with a
separate `costcap_migrate` (owns tables) and `costcap_app` (DML only, `CREATE`
revoked) role, Row-Level Security enabled, and per-tenant policies keyed on
`current_setting('app.org_id')`. Validate columns, keys, and RLS against the
migrations before changing schema. See
[adr/0007-postgres-migrations.md](adr/0007-postgres-migrations.md).

## Key decisions (ADRs)

Lightweight ADRs live in [adr/](adr/): CI security gates (0001), Playwright E2E
(0002), request logs (0003), deploy gate (0004), publish gate (0005), canary
(0006), Postgres migrations (0007), billing guard (0008), DNS gate (0009),
live-proof gate (0010). The through-line: **prove durable writes and provider
outcomes before showing success; keep secrets out of git and out of responses;
a target hosting plan is not a migration approval.**

## Recommended minimal architecture for the first dollar

The hosted free→paid machine is **already built end to end** (see
PATH_TO_FIRST_DOLLAR.md). The recommended first-dollar shape is the current one,
unchanged: one replica, the single-process JSON store, test-mode Stripe first,
then the live $19/mo readback — *no* new services. The only engineering levers
left on the path are code-only hardening that raises confidence in that shape,
not new infrastructure:

1. Metering accuracy across the providers the proxy already routes (pricing
   coverage) — the free product's core promise.
2. Prove and write-harden the Postgres tenant isolation in CI, so the eventual
   store cutover is a known-safe swap rather than a leap.

Everything else (a durable multi-replica store, dashboards beyond the current
fleet view, connectors) is **deferred behind a demand gate**, not on the
first-dollar path.

## Risks and release proof

Model-price drift, streaming/concurrent accounting, and proxy bypass are the
standing risks; coverage includes only mediated traffic. Before calling anything
shipped: run the repo checks, exercise the failure/isolation cases, inspect the
rendered UI/artifacts, and record the exact revision, a green CI run, and a live
readback. Docs do not activate payments, outreach, accounts, or infrastructure.

## What this file does not claim

npm publication, a public GitHub Marketplace listing, collected $19/mo revenue,
live inbox delivery, a provisioned Postgres, TLS on the `costcap.dev` apex, and a
two-week dogfood archive are **not** done. They are owner-gated — see
PATH_TO_FIRST_DOLLAR.md.
