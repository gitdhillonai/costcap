# Substrate adoption plan

2026-10-05 update. Plan plus current implementation status. Inputs: `openclaw-enterprise-evaluation.md`,
`engrams-evaluation.md`, `substrate-decision.md` and current source.

Current source review and public-page recheck support keeping the local
proxy custom. No OCE or engrams runtime has been integrated or tested.
This does not turn the existing local spike into a substrate spike.

## Components

| Component | Current implementation/plan | Replacement | Stays custom |
|---|---|---|---|
| Provider transport | src/proxy.js | None | Local routing and usage parsing |
| Run/day/month caps | src/cap.js | None | Receipt-based budget decisions |
| Model pricing | src/pricing.js, pricing-table.json | None | Versioned estimated rates |
| Retry detector | src/spiral.js | None | Normalized request fingerprints |
| Velocity/step breaker | src/velocity.js | None | Local spend rate and steps |
| Local kill/resume | src/kill.js | None | Shared file and child polling |
| CLI lifecycle | src/cli.js | None | SDK env routing and local ledger lock |
| Receipts/audit | Proxy ledger, planned hosted DB | None | Cost receipt schema and append-only audit |
| Enrollment/identity | Hosted durable single-process API and policy validation | None | Agent tokens and tenant authorization |
| Policy delivery/offline | Authenticated client sync with persistent cache | None | Versioned cache and receipt sync |
| Hosted org/auth | Email-code + Turnstile service, live login verified | None | Verified memberships and org roles |
| Fleet view/caps | Same-origin fleet UI and tenant-scoped API | None | UI, API, tenant isolation |
| Alert rules/delivery | Alert outbox and Brevo/Slack adapters; live alert routing not verified | None | Rule dedupe, Brevo/Slack delivery |
| Hosted billing | Not implemented | None | Free beta until verified |
| Remote runtime stop | Not implemented | Optional future OCE stop adapter | Authorization, acknowledgment and audit |
| Build factory | Not a runtime CostCap component | Reject engrams as CostCap substrate | Existing development workflow |
| CI budget check/Action | Implemented Action/check; publication unverified | None | Local receipt validation and exit codes |
| MCP budget API | Implemented Action/check; publication unverified | None | Implemented read-only MCP; ecosystem listing unverified |

## Adoption order and seams

1. Fix local accounting and safety before adding integration. The proxy observes
   usage after a response, so a permitted call can overshoot. Serial execution
   and exclusive ledgers prevent one class of race, not prepaid enforcement.
   Effort: 1-2 engineering days plus provider billing reconciliation.
2. Add authenticated enrollment, durable policy/cache and deduplicated receipt
   synchronization. Keep policy validation in `src/hosted/policy.js`; transport
   consumes `{version,caps,killed}`, never vendor runtime objects. Effort: 3-5
   days plus deployed integration tests. Cached policies are not authority to
   join another organization's fleet.
3. Add org-scoped dashboard/auth, alert delivery and audit persistence. This
   depends on secure enrollment and a real datastore. Effort: 5-10 days plus
   production authentication and isolation tests. No OCE requirement.
4. Optional OCE adapter only after an organization actually uses OCE. Define
   `stopAgent({namespace,agentId,requestId}) -> {accepted,operationId}` and a
   separate status query. Keep OCE credentials and API paths in an adapter,
   not the proxy or cap engine. An asynchronous stop acceptance is not proof
   that billing stopped. Effort: 2-4 days plus testing on an authorized OCE
   instance. No migration of caps/receipts/auth to OCE is proposed.
5. engrams: reject as a CostCap runtime substrate. No migration step. Its
   credential broker is reference research, not copied code or a dependency.

All effort estimates are planning ranges, not commitments or verified dates.
The optional OCE adapter remains a future integration, not a replacement.

## Public sources rechecked

- https://github.com/openclaw/openclaw-enterprise : MIT license and agent
  control-plane runtime; local setup requires its own runtime stack.
- https://docs-enterprise.openclaw.org/reference/agents/ : stop API and agent
  permission model. Does not prove hard spend reservation or stop latency.
- https://github.com/cortexapps/engrams : AGPL license and coding-agent runner.
  Not a drop-in zero-infrastructure local metering proxy.

The two prior evaluations contain broader claims that were not all rechecked.
Do not read absence in these pages as proof that a feature does not exist.
Epic #16's actual chosen-substrate spike criterion is not met by these docs.

Current deployed proof: production Turnstile, Brevo sign-in-code delivery to the owner-authorized test account, code verification, fleet HTTP 200 and logout HTTP 401 passed on October 5. This proves hosted login, not provider billing reconciliation or an OCE substrate spike. UI remains free beta and single-process file storage.
