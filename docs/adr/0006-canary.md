# ADR 0006: Canary checks the running server

Date: 2026-10-07. Status: accepted for the local and workflow command. This is not a production canary.

## Decision

`scripts/canary.mjs` requests `/health`, `/`, `/ui/config`, and unauthenticated `/v1/fleet`. It fails unless billing is disabled, persistence is `single-process-file`, config has only `siteKey`, and fleet returns 401. `deploy.yml` runs it only after the apply step succeeds. That apply step exits 2, so the production canary does not run.

## Consequences

Issue #41 closed when deploy run 37644183117 printed `canary: passed` against `COSTCAP_ORIGIN` after the apply.
