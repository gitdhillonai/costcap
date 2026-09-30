# costcap: design

## Evidence and audience

Sources inspected on main September 30, 2026: README.md, root package.json when present, open issue bodies and existing docs/ARCHITECTURE.md when present. Also docs/product-spec.md or docs/requirements/sprs-sprint-v1.md.

Audience: Agent developers and fleet operators. Mission: Bound proxy-mediated spend and explain what was counted.

## User flow

```text
Set cap -> wrap command -> inspect receipt; optional hosted fleet policy.
```

## Wireframe notes

Use a phone-readable primary view: scope/title and current revision above the main task; evidence and review status adjacent to derived results; next action below. Operator views show source timestamps, outcome and audit link. Public copy separates available capabilities from planned work. Preserve actual existing screens rather than replace them with this proposal.

## States

- Loading: pending, never an invented successful write.
- Invalid input: specific correction with retained safe input.
- Denied: no private content in error responses.
- Provider/storage unavailable: failure plus safe retry, not fabricated fallback data.
- Empty: distinguish no records from no data access.
- Review required: draft label persists until real review evidence is verified.
- Consequential controls: role and scope check plus explicit review flow. This doc grants no permission to act.

## Product-specific boundaries

Model-price drift, streaming/concurrent accounting and proxy bypass. Coverage only includes mediated traffic; guardrails, not bill insurance.

## Visual acceptance

Keyboard focus, labels, contrast, narrow-screen layout and no color-only status. Inspect actual pixels before release; these are flow/wireframe notes, not screenshots or claims that proposed screens exist.
