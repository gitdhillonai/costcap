# Tech stack

CostCap is a Node.js 20+ ESM package with no runtime dependencies. The CLI and local proxy live in `src/`. The hosted beta lives in `src/hosted/` and stores one JSON file. Tests are Node's built-in test runner (`npm test`). Playwright covers the hosted server in `e2e/` and is a dev dependency.

## Runtime

| Piece | Choice |
|---|---|
| Language | JavaScript, `"type": "module"` |
| CLI | `src/cli.js` (`costcap` bin): wrap, kill, resume, check, mcp, enroll, reconcile |
| Local proxy | `src/proxy.js`, binds to 127.0.0.1 |
| Pricing | Versioned estimates in `src/pricing-table.json` |
| Hosted process | `src/hosted/server.js`, started by `npm start` |
| Store | Single-process JSON file. Postgres migrations exist under `db/migrations/` and are proven in CI only. Production stays on the JSON store until `/health` reports a database backend. |
| Mail | Brevo, when `COSTCAP_EMAIL_PROVIDER=brevo` and deployment secrets are set. The launcher rejects other providers. |
| Bot check | Cloudflare Turnstile on hosted sign-in |
| Billing | Disabled unless an owner enables it after a Stripe readback. There is no price change in this repo's docs pass. `GET /api/health/stripe` reports `disabled`, `ready`, or `misconfigured` with boolean shape checks only. |

## Deploy contract

`compose.yaml` is the single-replica CI shape. `compose.production.yaml` is what the deploy workflow applies when deploy host, SSH key, and git SHA are present. Without those values the job exits without applying. TLS, DNS for costcap.dev, and a live Playwright canary against the deployed origin are still open and blocked. Do not treat a local test run as a production cutover.

## What this file does not claim

npm publication, a public GitHub Marketplace listing, collected $19/month revenue, live inbox delivery, and two-week dogfood receipts are not done.
