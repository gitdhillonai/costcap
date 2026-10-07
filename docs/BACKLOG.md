# Backlog

GitHub issues are the source of truth. This file is the index as of 2026-10-07.

| Issue | Priority | State | Selectable |
|---|---|---|---|
| #1 CLI epic | P0 | open | no, waiting on #5 |
| #4 cap engine | P0 | closed on verify run 37635348252 | no |
| #5 npm publish | P1 | blocked on `NPM_TOKEN` | no |
| #6 loop epic | P0 | open | no, waiting on #1 |
| #7 retry spiral | P0 | closed on verify run 37635348252 | no |
| #8 velocity and steps | P0 | closed on verify run 37635348252 | no |
| #9 kill switch | P0 | closed on verify run 37635348252 | no |
| #10 dogfood | P2 | blocked on 14 days of authorized receipts | no |
| #11 hosted epic | P0 | open | no |
| #12 org auth | P0 | blocked on live Turnstile and Brevo proof | no |
| #13 enrollment sync | P0 | blocked on a deployed origin | no |
| #14 Brevo and Slack alerts | P0 | blocked on an authorized live send | no |
| #15 distribution epic | P2 | blocked on publish and marketplace access | no |
| #16 OCE substrate | P2 | blocked, re-scoped to a later adapter | no |
| #37 CI security gates | P0 | closed on verify run 37634321530 | no |
| #38 Playwright E2E | P0 | closed on verify run 37635087734 | no |
| #39 request logs | P1 | closed on verify run 37635348252 | no |
| #40 IaC deploy | P1 | closed on deploy run 37644183117 | no |
| #41 deploy canary | P1 | closed on deploy run 37644183117 | no |
| #42 Postgres | P2 | blocked on an IaC-managed database | no |
| #43 billing disabled | P2 | blocked on Stripe readback; charging stays off | no |
| #44 costcap.dev DNS | P2 | blocked on DNS credentials | no |
| #45 live login and alert CI | P1 | blocked on production secrets | no |
| #46 Compose deploy gate | P0 | closed on verify run 37637693974 | no |
| #47 npm pack gate | P0 | closed on verify run 37638206551 | no |
| #48 canary command | P0 | closed on verify run 37638496816 | no |
| #49 Postgres migrations in CI | P1 | closed on verify run 37638742657 | no |
| #50 billing guard | P1 | closed on verify run 37640489524 | no |
| #51 DNS fail-closed workflow | P2 | closed on verify run 37640713639 | no |
| #52 live-proof shell | P2 | closed on verify run 37640949670 | no |

Closed: #2, #3, #4, #7, #8, #9, #17, #18, #19, #20, #37, #38, #39, #40, #41, #46, #47, #48, #49, #50, #51, #52.

#40 and #41 are closed. Deploy run 37644183117 applied commit 28d2e87010ba27465db6417f55ed7d27e8e0b8fb and the canary passed. `GET /health` on the origin reports that sha. The workflow still exits 2 when the host or deploy key is missing. This is not production-ready. Billing stays disabled.
