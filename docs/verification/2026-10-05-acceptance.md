# Acceptance evidence, October 5, 2026

## Live hosted login

At https://app.costcap.dev/, production Turnstile passed, the configured Brevo sender delivered one sign-in-code email to an owner-authorized test account, the code verified and the fleet endpoint returned HTTP 200. The dashboard was visually inspected. Sign out invalidated the session: the fleet endpoint then returned HTTP 401. Billing was disabled and the new organization had no agents or receipts. No paid provider call was made.

This is #12 evidence, not proof of multi-user memberships, hosted alert delivery, provider bills or two-week dogfood. Separate organizations for new email addresses and tenant isolation are covered by automated server tests. Same company domain does not confer membership.

## Local whole-wrapper runaway smoke

Run `node scripts/runaway-smoke.mjs`. Saved results: `2026-10-05-runaway.json`. The script uses the real CLI wrapper with a local fake OpenAI server and no credentials:

- Run cap: one upstream call, then budget_exceeded. The accepted fake call reports $0.15 against a $0.10 cap. This deliberately demonstrates the one-request overshoot boundary, not a strict pre-authorized dollar ceiling.
- Repeated retry: five identical requests allowed, sixth blocked with spiral_detected; five upstream calls.
- Max steps: three upstream calls, fourth blocked with step_budget.
- Existing kill file: first request blocked with killed, zero upstream calls.

Every attempted request has a receipt, including the block. Existing tests additionally cover local kill/resume, child termination, velocity baseline/latching and durable ledger refusal on unknown cost. The fresh smoke does not exercise a live provider, fuzzy semantic similarity, remote fleet freeze latency or provider-bill reconciliation.

## Still open

- #1/#4: real provider usage and bill reconciliation. Current caps are receipt-based and allow one accepted request to overshoot.
- #5/#15: published npm package/listings and verified distribution claims. Private repos stay private.
- #6/#7/#8/#9: these local smoke/test results support local behavior, with the above boundaries; do not promise instant network-wide remote kill or semantic loop detection.
- #10: runner installation, two weeks of real receipts and healthy-run review. NightlyQA main now honors the routing environment variable; wrapping its existing workload is still a deployment task.
- #11/#13/#14: complete live fleet enrollment/sync and owner-scoped alert delivery. UI and API exist; live login passed. Postgres/HA, invites and paid billing are not built.
- #16: actual chosen-substrate spike. The decision keeps CostCap custom and treats OCE as optional. A custom-loop smoke is not an OCE spike.
