# ADR 0004: Deploy gate fails closed

Date: 2026-10-07. Status: accepted for the git definition. This is not an applied deploy.

## Decision

`compose.yaml` defines one service, `user: "1000:1000"`, one volume at `/data`, and `deploy.replicas: 1`. Required runtime values use Compose's required-variable syntax. `.github/workflows/deploy.yml` runs only on `workflow_dispatch`, checks those names with `scripts/deploy-preflight.mjs`, renders the file, and then runs `scripts/deploy-apply.mjs`, which exits 2 without contacting a host.

## Consequences

Issue #40 stays open until a workflow log shows an apply and a `/health` readback. This gate does not SSH and does not print secret values.
