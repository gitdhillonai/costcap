# Build status

- 2026-10-09: PR (feat/revenue-readiness) adds Stripe billing code gated OFF by default (COSTCAP_BILLING unset = free behavior unchanged), offline policy proof page at /proof/offline-policy.txt, billing-readiness and launch-draft docs. Deploy plumbing only passes optional env vars through (no Dockerfile or Coolify changes). Billing enable waits for Stripe provisioning (TEST mode first).

- 2026-10-09: account gate v2 (billing locked to approved Stripe account id; still disabled by default). Apex/www costcap.dev now permanently redirect to app.costcap.dev (Traefik labels). Routing fix: old Coolify app container stopped, new compose container serves app.costcap.dev.

- 2026-10-09: billing enabled via deploy-billing workflow (Stripe account/price readback gate at startup; no charges made; auto-rolls the flag off on canary failure).

- 2026-10-09: safe billing startup: a failed Stripe readback at boot now keeps the app up with billing disabled (canary still fails when billing is expected). Cause of the earlier crash-loop: restricted key lacked Account read (403).
