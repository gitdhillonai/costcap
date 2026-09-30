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

- Issue #20: Spike: minimal register-policy-kill loop on the adopted substrate (epic #16)
- Issue #19: Substrate adoption plan: what gets replaced, order, what stays custom (epic #16)
- Issue #18: Evaluate engrams as agentcontroltower.io build substrate (epic #16)
- Issue #17: Evaluate OpenClaw Enterprise as control-plane substrate (epic #16)
- Issue #16: EPIC: Adopt OpenClaw Enterprise + engrams as the agent substrate (build ON, not from scratch)
- Issue #15: Epic: distribution (M4)
- Issue #14: Story: alerts (Resend email + Slack) + audit log
- Issue #13: Story: agent enrollment + policy sync (offline = last-known)
