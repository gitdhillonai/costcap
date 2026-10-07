# CostCap

Local spend guardrails for proxy-routed AI requests. Development beta.
The CLI meters token usage, stops subsequent calls once a budget is reached,
detects normalized retry patterns, enforces step budgets, and supports a local
kill file. MIT, no warranty. No paid hosted service is available in this repo.

## Run from source

Node 20 or newer; no runtime dependencies.

```sh
npm test
node src/cli.js wrap --cap 5 --day-cap 10 --max-steps 40 -- node your-agent.js
node src/cli.js kill "pause local wrapped agents"
node src/cli.js resume
```

The wrapper sets provider base URL environment variables. Your SDK must honor
them. Hardcoded endpoints and subprocesses that ignore these variables bypass
CostCap. The local proxy binds to 127.0.0.1.

## Enforcement limits

- Metering uses provider-reported usage after each response. A call can exceed
  the remaining budget; this is **not** a prepaid reservation or bill guarantee.
- Requests are serialized inside a proxy. A receipt ledger is exclusively locked
  for each wrapper. Separate ledgers do not share day/month caps. A crashed
  wrapper leaves a lock that you must remove only after checking it stopped.
- Daily and monthly periods use UTC. Pricing is a versioned estimate, not the
  provider bill. Check `src/pricing-table.json` before relying on rates.
- Missing/invalid usage or an uncertain network outcome pauses further calls.
  Such receipts have `cost_usd: null`. Reconcile them before starting again;
  existing unknown-cost receipts block restart. Never replace unknown cost with
  zero without evidence from the provider.
- SSE responses are buffered, not delivered in real time. OpenAI chat/Responses,
  Anthropic start/delta usage, and Gemini usageMetadata have local fixture tests.
  Provider billing reconciliation and live SDK compatibility remain unverified.
- Anthropic cache creation is estimated at the input rate. Provider-specific
  cache-write multipliers, other billable features and dynamic pricing may differ.
- The default kill file is relative to the working directory. Only agents sharing
  that file are affected. Polling defaults to 500ms, with SIGKILL after 5 seconds.
  It does not undo a request already accepted by the provider or stop remote agents.
- This proxy is for a trusted local machine, not an exposed multi-tenant service.
  It does not establish an authentication boundary against other local processes.

Receipts include unique IDs, timestamp, model, usage, versioned estimated cost,
and blocked reasons. No request bodies or authorization headers are written.

The local CLI is covered by `npm test`. The hosted beta at the configured
origin serves the fleet UI with billing disabled. Live email login, live alert
delivery, npm publication, marketplace distribution, and two-week dogfood are
not certified by this repository's tests. `costcap reconcile` compares a local
receipt file with a provider charge file and does not call a provider.

## Enrollment client (service not yet deployed)

```sh
# Set COSTCAP_ENROLL_TOKEN through your local secret manager, not CLI arguments.
node src/cli.js enroll --url https://your-fleet-service.example --name worker-1
node src/cli.js wrap --enrollment .costcap/enrollment.json --cap 1 -- node your-agent.js
```

The client expects `/v1/enroll`, `/v1/policy` and `/v1/receipts` from a trusted,
authenticated fleet service. It caches the policy and enforces it while offline.
Only newer versions replace cached caps or kill state; local caps may tighten,
not loosen, the policy. Polling is once per minute, not instant remote kill.
Receipt IDs are acknowledged before marking them synced. Credentials are stored
mode 0600. A 401/403 response freezes the wrapper. Redirects are refused to avoid
forwarding agent credentials to another host. These paths have local test-server
coverage, not production verification or a finished org dashboard.

## CI check and local MCP

```sh
node src/cli.js check --receipts .costcap/receipts.jsonl --cap 5
node src/cli.js mcp --receipts .costcap/receipts.jsonl --day-cap 10
```

`check` returns JSON and exits 0 below the budget, 1 at/above it or with unknown
cost, and 2 for missing/malformed evidence. `--cap` sums the entire selected
receipt file, not one reconstructed run. `--day-cap` and `--month-cap` use UTC.
`action.yml` exposes this check as a composite GitHub Action; no Marketplace
listing or public release has been made. MCP exposes only `budget_status` via
JSON-RPC stdio. It cannot kill, resume, change caps or spend money. Local MCP
protocol tests do not substitute for verification in every MCP client.

<!-- generated-by: workspace-admin/iac-independence -->

## Setup

```bash
bash scripts/setup.sh
```

Requires: Node 20+, and access to `gitdhillonai/dotenv` for `.env.local`.

## Environment

See `.env.example`. Pull real values with `bash scripts/pull-secrets.sh`.

## Deploy / Rollback

Deployed via Coolify on the Hetzner box (Path A) on push to `main`.
Rollback: Coolify dashboard → Deployments → redeploy previous, or `git revert`.
