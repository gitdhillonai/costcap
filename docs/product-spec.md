# CostCap — Product Spec v0.1

**Product**: the agent spend kill switch. A free open-source CLI that caps what any AI agent can spend on LLM/API calls, plus a hosted guardrails dashboard ($19/mo) for fleets, alerts, and audit.

**Domain**: costcap.dev (registered by Roger, 2026-09-29).

**Trilogy**: ConeReplay tests agent code before it ships (pre-deploy). NightlyQA walks the live product after deploy. CostCap bounds what the agent can spend while it runs. Shared engine DNA (proxy/metering core), separate products, same marketplace pipeline.

## Positioning (locked by Roger, 2026-09-29)

**Guardrails, not guarantees.** The CLI is MIT, no warranty. The hosted ToS caps liability at fees paid. We never say "we guarantee your bill" - no enterprise-guarantee tier, ever. Honest frame: we make runaway spend structurally hard and instantly visible; we do not insure it.

## Why now

Runaway execution is the most expensive agent failure class: documented multi-agent retry spirals burning tens of thousands of dollars over days while every health check reported green (composite forensic pattern: clyro.dev/blog/the-47k-loop-a-complete-forensic-analysis - loop detection, cost ceiling, step limits, and deviation circuit breakers are the four controls that stop it). Agent spend is exploding and every team wiring an agent to a credit card is one edge case from a five-figure week.

## Competitive frame (checked 2026-09-29)

- **LiteLLM proxy**: real budgets (max_budget per key, budget_duration, team budgets, tpm/rpm limits) - but it's platform-team infrastructure: deploy a proxy service, manage virtual keys, own the config. (docs.litellm.ai/docs/proxy/virtual_keys)
- **Portkey / Helicone / Langfuse**: observability-first; budgets are advisory or enterprise-tier.
- **Our wedge**: agent-first and zero-infra. One line (`costcap wrap -- <your agent command>` or `npx costcap`), hard local enforcement with no server to run, agent-specific loop detection, OSS trust. LiteLLM answers "how does the platform team govern spend"; CostCap answers "how do I, the dev shipping an agent tonight, make sure it can't burn me".

## The CLI (free, MIT)

- **Wrap any agent**: `costcap wrap --cap 5.00 -- <command>` sets a hard spend ceiling for everything the wrapped process does. Works by pointing the agent's provider base URLs (OpenAI, Anthropic, Gemini, OpenRouter) at a local metering proxy; no code changes in the agent.
- **Caps**: per-run, per-day, per-month. At the cap the proxy hard-stops - the upstream call never happens, the agent gets a clean budget-exceeded error, and the run's receipt says exactly why.
- **Loop detection**: repeated near-identical requests (retry spirals), cost-velocity circuit breakers (>3x baseline deviation), and step budgets. The $47K pattern dies on day one.
- **Kill switch**: `costcap kill` (or touching the kill file) freezes every wrapped agent instantly; `costcap resume` lifts it.
- **Receipts**: every run leaves a local JSON receipt - calls, tokens, cost per model, cap status. Audit-ready, no account needed.
- **Pricing table**: versioned model-price data, offline-verifiable; unknown models bill at a declared fallback rate, never silently free.
- **Honesty boundary**: local enforcement covers traffic that flows through the proxy. An agent that bypasses the proxy bypasses CostCap - the docs say so plainly.

## Hosted dashboard ($19/mo)

- Org-first (engineering standards: no orphan users, company email -> company org, email verification + Turnstile).
- Fleet view: every enrolled agent, its caps, live spend, kill/resume state.
- Alerts: cap-approaching (80%), cap-hit, loop-detected, agent-silent - email (Resend) + Slack.
- Central cap management: change caps for a fleet without redeploying agents (CLI phones home for policy when enrolled; offline = last-known policy, receipts sync on reconnect).
- Audit log: who raised a cap, who killed an agent, when.
- Trial: 14 days, no card. Churn safety: cancel anytime, CLI keeps working free forever.

## Engineering

- TypeScript CLI on npm (`costcap`), Node 20+, single-command install. Mirrors NightlyQA's stack and build standards.
- Hosted: Next.js on persooninc1 (Coolify, own DB+role on shared Postgres), Resend for mail, Stripe staging until launch. Work on main.
- Creds to vault + private dotenv repo (costcap/.env.local); accounts/ dir; build time in prod footer; no repo links in footer.
- Dogfood: our own agent fleet first - NightlyQA's nightly walks (already burns OpenAI nightly), Pictage evals, ShipReady sync jobs. Real receipts, real caps.

## Distribution (shared pipeline)

- costcap.dev site (deploy lane, Hetzner) - guardrails-not-guarantees copy, the $47K-pattern story, OSS-first CTA.
- GitHub: public repo at launch for the stars funnel (repo stays private during build; flip at launch), GitHub Action (`costcap check` in CI to gate agent eval jobs on budget).
- Then the trilogy marketplace path: GitHub Marketplace, MCP ecosystem channels (MCP server so agents can check their own budget), AWS, Microsoft - verified claims only, coordinated with the marketplace agent through main.

## Milestones

1. **M1 - CLI core**: proxy + pricing table + caps + hard stop + receipts, wrapped around a real agent run. Dogfooded on NightlyQA's nightly OpenAI spend.
2. **M2 - loop detection + kill switch**: retry-spiral detector and circuit breaker proven against a synthetic runaway agent.
3. **M3 - hosted dashboard**: org/auth/fleet/alerts/audit, $19/mo Stripe, 14-day trial. costcap.dev live.
4. **M4 - distribution**: public repo, Action, marketplace listings with verified claims.

## Open decisions

None blocking. Legal fields on marketplace listings are Roger's at listing time (same as ShipReady/NightlyQA).
