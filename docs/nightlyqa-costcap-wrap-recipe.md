# Wrapping NightlyQA's nightly run with CostCap (M1 dogfood recipe)

Status: deployment recipe. NightlyQA source prerequisite verified; runner installation and actual fleet receipts remain unverified.

## Current prerequisite status
Live NightlyQA main inspected 2026-10-05: src/llm.js now uses OPENAI_BASE_URL with the existing OpenAI default and throws LlmBlocked for budget_exceeded, killed, spiral_detected and breaker_open. The original hardcoded URL prerequisite is fixed. This source check does not prove the runner is wrapped or receipts are being retained.

Deployment is coordinated with NightlyQA's owner lane. Do not start extra paid runs to manufacture evidence. Wrap the already-authorized nightly workload and keep its receipt ledger on the persistent volume. The two-week clock starts with actual retained fleet receipts, not the date of this recipe.

## Wrap command
CostCap sets `OPENAI_BASE_URL=http://127.0.0.1:<port>/openai/v1` for the child.

    cd /app && costcap wrap --cap 2.00 --day-cap 5.00 --month-cap 50.00 \
      --receipts /data/costcap/receipts.jsonl --kill-file /data/costcap/KILL \
      -- node src/index.js run

- Caps: $2 per run, $5 per day, $50 per month. Rationale: NightlyQA makes exploratory LLM calls only, and a clean night should cost cents, so these sit well above normal and still stop a runaway within one run. Revisit after the first week of receipts.
- `schedule` mode (long-lived cron) should wrap the whole process with `--day-cap`, not `--cap`, since the run cap resets per process.
- Keep `--receipts` on the persistent volume so day and month caps survive container restarts.

## Dogfood exit checks
1. First wrapped run produces receipts with non-zero `cost_usd` and no `fallback:true` for the model NightlyQA uses (if fallback shows, add the model to `src/pricing-table.json`).
2. Set `--cap 0.01`: the second call returns 429 `budget_exceeded` and NightlyQA records the failure as a tool error, not a false product finding. Check this: a blocked LLM call must not file a GitHub issue against the target.
3. `touch /data/costcap/KILL` mid-run: the child stops (SIGTERM, exit 143) and no further upstream calls happen. `costcap resume` clears it.
4. Compare receipt totals with the OpenAI dashboard for the same night. Differences mean unmetered paths (streaming without usage, other keys).

## Known risks
- Streaming responses only meter if the caller sets `stream_options.include_usage`. NightlyQA's call is non-streaming, so fine.
- Bypass: any code path that calls OpenAI without the env var is unmetered. Only `src/llm.js` references the API today (code search on the repo).
- The nightly runner is currently started from the QA agent's 4am wake until Coolify takes over; the wrap command applies to whichever starts it.
