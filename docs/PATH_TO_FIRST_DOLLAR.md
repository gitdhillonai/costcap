# CostCap: path to the first dollar

Release view as of 2026-10-14 (`main` `46857ac`, `npm test` 158 green). Companion
to [ARCHITECTURE.md](ARCHITECTURE.md). This is a sequencing note, not a revenue
claim: the $19/mo figure is a pricing *hypothesis*, not collected revenue, and
nothing here authorizes a charge, a price change, a deploy, DNS, or a key.

## The money path

- **Free lead magnet (shipping):** the MIT local CLI + proxy — meter, cap,
  hard-stop, spiral/velocity/step breakers, kill file, `costcap check` for CI.
  Runs from source today with zero dependencies.
- **The one paid artifact:** a **hosted workspace plan — $19 USD/month** (the
  fleet dashboard: org login, agent enrollment, synced receipts, spend view,
  alerts, audit, receipt CSV). The CLI stays free; payment supports the hosted
  service rather than gating a feature away from free users.

So the first dollar is **one hosted workspace subscribing to the $19/mo plan**,
proven first in Stripe **test mode**, then on the permitted $1/live path.

## What is already built (the free→paid machine is complete in code)

The entire conversion loop exists and is tested — this is **not** a build-it
problem, it is a turn-it-on problem:

1. Honest landing + org-first email-code login (Turnstile) — `src/hosted/server.js`, `ui.js`.
2. Agent enrollment, policy sync, receipt sync, spend view, alerts, audit, CSV — all org-scoped.
3. **Checkout + portal wired from the dashboard UI in both live and test mode.**
   The "Review $19/month subscription" / "Continue in test mode" button →
   `POST /billing/checkout` → Stripe Checkout; "Manage or cancel" →
   `POST /billing/portal`. Owner-only; viewers cannot buy.
   (`ui.js` `billing()` runs whenever `/v1/fleet` reports `billing:"enabled"`.)
4. Honesty-safe billing core (`src/hosted/billing.js`): live key required for the
   live path; **test mode accepts `sk_test_` only, creates/edits no price, and a
   `livemode:true` object never grants a plan**; subscription state is read back
   from Stripe, not inferred from a redirect; `canceled`/`unpaid`/`incomplete_expired`
   return the workspace to free beta; zero-amount invoices never count as paid;
   refund/dispute handling re-reads the invoice. `/api/health/stripe` reports
   `disabled`/`ready`/`misconfigured` with booleans only.

## Critical path to the first (test-mode) dollar

Ordered. Each step is **owner-gated** unless marked ready-for-grok. None of the
owner steps can be done from an agent session.

1. **Owner — deploy `main` to the hosted origin.** `app.costcap.dev` is behind
   `main`; Coolify deploys on push to `main` (owner-gated; already on MORNING-LIST).
   `GET /health` must report the deployed SHA; the Playwright canary must pass.
2. **Owner — provide test-mode Stripe config** in the deploy environment:
   `COSTCAP_BILLING=enabled`, `COSTCAP_STRIPE_MODE=test`, `COSTCAP_STRIPE_SECRET_KEY=sk_test_…`,
   `COSTCAP_STRIPE_WEBHOOK_SECRET=whsec_…`, and an **owner-supplied** test
   `COSTCAP_STRIPE_PRICE_ID` (this repo does not create prices). No price change,
   no live key.
3. **Verify the loop (test mode):** owner logs in → "Continue in test mode" →
   Stripe test Checkout → return → `/billing/status` shows the subscription →
   portal cancels it → workspace returns to free beta. This is the first
   end-to-end dollar, with no real money.
4. **Owner — live cutover (separately approved):** the live path already enforces
   the Persoon.ai Inc account + USD 1900/month/licensed price readback at boot.
   Use the approved restricted $1 promotion or a $1 test path per
   [billing-readiness.md](billing-readiness.md); do **not** issue a $19 owner
   smoke charge and do not call owner self-purchase "demand."

### Code-only levers on the path (ready-for-grok)

These raise confidence in the shape above and need **no** owner input, no deploy,
no keys — pure code + tests that run in CI today:

- **Pricing coverage** — expand `src/pricing-table.json` to the Anthropic, Gemini,
  and top OpenRouter models the proxy already routes. Today only OpenAI models
  have real rates; everything else prices at the generic fallback (≈$2.50/$10 per
  1M), so Claude/Gemini spend can be under-estimated several-fold and caps
  overshoot — directly undercutting the product's core promise. Source-cited,
  versioned, unknown-still-falls-back. *(New story — see the board.)*
- **Prove + write-harden Postgres tenant isolation** — add `WITH CHECK` to the
  RLS policies and a CI test that proves one org cannot read or write another's
  rows as the app role (fail-closed when `app.org_id` is unset), so the eventual
  JSON→Postgres cutover is a known-safe swap. CI-only; no provisioned DB.
  *(New story — see the board, under #42/#11.)*

## Owner gates (nothing here is buildable by an agent)

| Gate | Issue | Blocker |
|---|---|---|
| Deploy `main` to the origin + live canary | epic #11 | Coolify promote is owner-only |
| Test-mode Stripe keys + owner test price id | #11 / billing-readiness | Secrets + an owner-created test price |
| Live $19/mo readback + $1 proof | billing-readiness | Live key, recorded owner approval, no price change |
| `costcap.dev` DNS + TLS | #44 | DNS provider credential (not in this environment) |
| Provisioned Postgres + cutover | #42 | An IaC-managed instance; JSON store stays until `/health` readback |
| Live login + alert proof in CI | #45 | Production Turnstile + Brevo secrets in the `production` environment |
| `npm publish` (so `npx costcap` resolves) | #5 | `NPM_TOKEN`; publish is CI/IaC, never a laptop |
| Public-repo decision + Marketplace listing | #15 | Owner decision + Marketplace publisher access |
| Two-week fleet dogfood | #10 | An authorized workload + 14 days of real receipts |

## Deferred behind a demand gate

Correct scope, just **off** the first-dollar path until real users ask:
durable/multi-replica store beyond the single-process JSON file, dashboards
beyond the current fleet view, provider-bill reconciliation via a billing API,
an OCE substrate adapter (#16, closed/re-scoped), and broad distribution
(Marketplace, public repo). **Trigger to revisit:** repeated paying-workspace
requests or the first retained paid workspace — not an owner smoke purchase.

## Honesty boundary (do not cross)

Guardrails, not bill insurance — only proxy-routed traffic is controlled and a
receipt cap can overshoot by one accepted call. Pricing is a versioned estimate,
not a provider bill. Planned revenue is not collected revenue. No paid
acquisition or outreach before the release-acceptance gates in
[billing-readiness.md](billing-readiness.md) pass. No claim of customer demand
from an owner's own smoke payment.
