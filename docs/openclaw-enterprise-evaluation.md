# OpenClaw Enterprise evaluation (story #17)

Evidence only, from public pages read on 2026-10-02. No code was run and nothing was integrated.

## Naming caution
Several unrelated GitHub repos use the name "openclawenterprise" or "engram" (for example mholovetskyi/openclawenterprise, vincents-ai/engram, Gentleman-Programming/engram). None of them is the project in this evaluation. Sources below are the official ones only.

## OpenClaw Enterprise (OCE)
Sources:
- Announcement, Sep 29, 2026: https://openclaw.ai/blog/openclaw-enterprise
- Repo: https://github.com/openclaw/openclaw-enterprise
- Docs, Agents reference: https://docs-enterprise.openclaw.org/reference/agents/
- Docs, Operate: https://docs-enterprise.openclaw.org/guides/operate/

What it is: an open source, vendor-neutral control plane for persistent agents ("Kubernetes for agents" per the repo README). The control plane (OCC) manages tenant Namespaces and Agents on Kubernetes; local dev uses docker-compose or k3d.

Facts checked:
- License: MIT (GitHub repo page shows "License: MIT License"; README says "MIT. Third-party components retain their own licenses").
- Maturity: the announcement says it is developed in the open before a 1.0 "later this year" and is for "internal pilot workloads". Repo created 2026-08-29, 317 stars, 123 open issues. Top contributors are OpenAI-affiliated accounts; the announcement says it was donated to the OpenClaw Foundation and developed with Red Hat and NVIDIA.
- Agent model: an Agent is a named workload in a Namespace with its own identity, revision history and permissions. An authorized `POST .../agents/:agentId/stop` sets the desired state to stopped and the worker removes execution and routing. Writes mention an audit record (a `503 UNKNOWN_OUTCOME` when OCC cannot confirm the write or its audit record). Permissions are per Agent and per Namespace.
- Kill-switch fit: a stop primitive and per-agent permissions exist. Whether stop is "instant" is not stated (it is asynchronous, `202`).
- Spend control fit: I found no budget, cost cap or token metering in the two docs pages I read. Not proven absent, but not evidenced.

Fit against CostCap: OCE governs agents it deploys and runs on Kubernetes. CostCap's wedge is the opposite: one command wraps any agent a developer already runs, with no infrastructure. OCE would force a cluster on that user.

## Limits of this evaluation
Public docs only. I did not read OCE or engrams source, run either, or verify performance claims. The kill-latency and cost-feature gaps above are "not found in pages read", not confirmed absences.

See docs/substrate-decision.md for the recommendation.
