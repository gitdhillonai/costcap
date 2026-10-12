# Status

Updated 2026-10-12. Open issues are the backlog. Epics #11 (M3 dashboard) remains open. #5, #10, #15, #42, #44, #45 are blocked on credentials or live proof.

Shipped on main this session: fleet agents include UTC day, month, and all-time estimated spend. Unknown receipt cost is counted separately and is not treated as $0. The workspace agent card shows today and month spend. Tests: `test/hosted-server.test.js`, `test/ui.test.js`.

Still blocked without owner gates: npm publish (#5), live login/alert CI (#45), DNS/TLS IaC (#44), Postgres roles (#42), Playwright canary against the deployed origin (called out on #11). Billing price and Stripe configuration were not changed.
