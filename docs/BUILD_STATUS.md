# Build status

- 2026-10-09: PR (feat/revenue-readiness) adds Stripe billing code gated OFF by default (COSTCAP_BILLING unset = free behavior unchanged), offline policy proof page at /proof/offline-policy.txt, billing-readiness and launch-draft docs. Deploy plumbing only passes optional env vars through (no Dockerfile or Coolify changes). Billing enable waits for Stripe provisioning (TEST mode first).
