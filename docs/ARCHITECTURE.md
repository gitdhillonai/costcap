# costcap: architecture

## Evidence and status

Sources inspected on main September 30, 2026: README.md, root package.json when present, open issue bodies and existing docs/ARCHITECTURE.md when present. Also docs/product-spec.md or docs/requirements/sprs-sprint-v1.md.

This is a docs-only plan, not a certification of deployment, payment or review readiness. Proposed entities and flows remain planned until proven in code. Main-branch documents are evidence, not authorization for side effects.

## Stack and deployment

Current root package runs Node tests; source includes JS proxy/pricing and versioned pricing data. Spec proposes TypeScript CLI and Next.js hosted service on Hetzner/Coolify with own DB role. Proposed TypeScript is not the current JS implementation.

## Boundary diagram

```text
Set cap -> wrap command -> inspect receipt; optional hosted fleet policy.
```

For browser products: client -> application/auth boundary -> tenant-scoped storage -> separately configured providers. Do not put provider credentials in clients. For SDK/CLI products: local instrumentation/broker -> authorized mediated call -> local receipt; hosted sync is optional and separately secured.

## Data model

Versioned pricing data and proxy fixtures; hosted policy/receipt/audit entities proposed.

Validate actual columns, keys, foreign-key behavior and RLS against migrations before modifying schema. Proposed commercial state separates order, verified payment event, entitlement and delivery; failures must not manufacture success.

## Key decisions

- Preserve the existing runtime and tenant boundaries; a target hosting plan is not a migration approval.
- Private data requires role checks and tenant isolation at storage/API boundaries.
- Store source/revision and review evidence alongside derived output.
- Secrets stay outside git; examples contain placeholders only.
- Verify durable writes and provider outcomes before showing success.

## Risks and release proof

Model-price drift, streaming/concurrent accounting and proxy bypass. Coverage only includes mediated traffic; guardrails, not bill insurance.

Run actual repo checks, test failure/isolation cases, inspect rendered UI/artifacts, and record exact revision, green CI and live readback before calling shipped. Docs do not activate payments, outreach, accounts or infrastructure.

## Backlog entry points

The selectable queue is in docs/BACKLOG.md. Updated 2026-10-07.

- #37 is closed. The verify workflow pins actions, audits dependencies, and scans tracked text. See docs/adr/0001-ci-security-gates.md.
- #38 is closed. Playwright drives the real hosted server in CI and does not prove production login. See docs/adr/0002-playwright-e2e.md.
- #39 adds JSON access logs that omit secrets. #40, #41, #42, #44, and #45 stay blocked on credentials or a host.
- #16 stays a later OCE adapter, not the build substrate. See docs/substrate-decision.md.
- #11 remains the hosted epic. Billing stays disabled until #43 has a Stripe readback.
