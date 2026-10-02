# engrams evaluation (story #18)

Evidence only, from public pages read on 2026-10-02. No code was run and nothing was integrated.

## Naming caution
Several unrelated GitHub repos use the name "openclawenterprise" or "engram" (for example mholovetskyi/openclawenterprise, vincents-ai/engram, Gentleman-Programming/engram). None of them is the project in this evaluation. Sources below are the official ones only.

## engrams
Sources:
- Site: https://engramsfactory.com/
- Announcement, Sep 24, 2026: https://builders.cortex.io/blog/introducing-engrams/
- Repo: https://github.com/cortexapps/engrams

What it is: a self-hosted orchestrator that runs coding agents (Claude Code, Codex, custom harnesses) in Firecracker microVMs, snapshots idle sessions, and starts runs from Slack, schedules or PRs. Cortex uses it internally.

Facts checked:
- License: GNU AGPL v3.0 (repo page). The harness SDK crates are Apache-2.0 per the README. AGPL matters if we modify it and offer it as a hosted service: network use triggers source-sharing obligations.
- Maturity: repo created 2026-04-27, 39 stars, 39 open issues, essentially one main contributor (nikhilunni, 1867 contributions) plus bots.
- Relevant features: a credential broker/proxy that "inserts the credential outside the VM and blocks requests the policy does not allow", per-service allowed operations, session profiles.
- Requirements: production needs Intel nodes with nested virtualization (C3 on GKE, m8i or metal on EKS).
- Kill switch and spend control: not found in the pages read.

Fit against CostCap: engrams is a coding-agent runner, not a governance layer for arbitrary agents, and it needs heavy infrastructure. Its credential broker is closer to KeyLeash than to CostCap.

## Limits of this evaluation
Public docs only. I did not read OCE or engrams source, run either, or verify performance claims. The kill-latency and cost-feature gaps above are "not found in pages read", not confirmed absences.

See docs/substrate-decision.md for the recommendation.
