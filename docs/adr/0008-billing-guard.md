# ADR 0008: Billing flag does not open a charge route

Date: 2026-10-07. Status: accepted. Charging stays off.

## Decision

`src/hosted/run.js` throws if `COSTCAP_BILLING` is set. The hosted server has no charge route. The repository does not depend on a Stripe client.

## Consequences

Issue #43 stays open until a Stripe readback exists. The spec's $19 figure is not collected revenue.
