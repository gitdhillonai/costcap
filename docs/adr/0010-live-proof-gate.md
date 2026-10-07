# ADR 0010: Live proof sends no mail

Date: 2026-10-07. Status: accepted for the fail-closed shell. This is not a login or alert proof.

## Decision

`scripts/live-proof.mjs` exits 2 when `TURNSTILE_SECRET_KEY`, `BREVO_API_KEY`, or `COSTCAP_ALERT_ORG_ID` is missing. It also exits 2 when they are present. It does not call Brevo or Turnstile and it does not print secret values. `.github/workflows/live-proof.yml` runs that script on `workflow_dispatch`.

## Consequences

Issue #45 stays open until a workflow log shows a provider response for an authorized inbox and an authorized alert org. This gate sends no mail.
