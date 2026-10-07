# ADR 0004: Deploy gate fails closed

Date: 2026-10-07. Status: accepted. An apply runs only from the deploy workflow when its secrets exist.

## Decision

`compose.yaml` is the local and CI render: one service, `user: "1000:1000"`, one volume at `/data`, and `deploy.replicas: 1`. `compose.production.yaml` is the host definition: the same one replica, UID 1000, the existing `/opt/costcap/data` directory, Traefik for `app.costcap.dev`, and `COSTCAP_GIT_SHA` on `/health`. `.github/workflows/deploy.yml` runs on `workflow_dispatch`. `scripts/deploy-preflight.mjs` checks the runtime names. `scripts/deploy-apply.mjs` exits 2 when `COSTCAP_DEPLOY_HOST`, `COSTCAP_DEPLOY_SSH_KEY`, or `COSTCAP_GIT_SHA` is missing. When they are present it extracts this repo to `/opt/costcap/src` and runs `scripts/deploy-remote.sh`, which keeps the host `.env` and data directory and rolls the image back if `/health` does not report that commit.

## Consequences

Issue #40 closes only when that workflow log shows the apply and the health readback. The script does not print secret values. Billing stays disabled.
