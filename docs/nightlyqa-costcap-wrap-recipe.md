# Wrapping NightlyQA's nightly run with CostCap (M1 dogfood recipe)

Status: draft for review. Nothing here has been run against NightlyQA or deployed.

## Why a code change is needed first
NightlyQA calls OpenAI with a hardcoded URL (`src/llm.js` line 10: `fetch('https://api.openai.com/v1/chat/completions', ...)`). CostCap meters by rewriting the provider base URL, so traffic bypasses it today. One-line change in gitdhillonai/nightlyqa `src/llm.js`:

    const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    ... fetch(`${OPENAI_BASE}/chat/completions`, ...)

Behaviour is unchanged when the variable is unset.

## Wrap command
CostCap sets `OPENAI_BASE_URL=http://127.0.0.1:<port>/openai/v1` for the child.

    cd /app && costcap wrap --cap 2.00 --day-cap 5.00 --month-cap 60.00 \
      --receipts /data/costcap/receipts.jsonl --kill-file /data/costcap/KILL \
      -- node src/index.js run

- Caps are placeholders. Set them from the real nightly spend after the first receipts. Roger's call on the numbers.
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
