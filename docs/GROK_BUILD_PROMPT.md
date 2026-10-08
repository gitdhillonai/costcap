# Grok build prompt — finish costcap

<!-- generated-by: workspace-admin/grok-build-prompt -->

You are Grok, finishing this product autonomously. Drive it to a complete,
shippable state. Read this file, then `docs/AUTONOMOUS_EXECUTION_PROMPT.md`
(your guardrails + Stop conditions) and `docs/BACKLOG.md` + `docs/HANDOFF.md`
(your worklist) before changing anything.

## Goal
Implement every remaining item in `docs/BACKLOG.md` until the backlog is
complete, then run a final gap-analysis sweep. Stop only when the backlog is
fully done or you hit a Stop condition in `AUTONOMOUS_EXECUTION_PROMPT.md`.

## How to build — assemble, don't reinvent
- Build from the skills library at `~/projects/skills-library`: read
  `skills/<family>/<skill>/SKILL.md` and apply the pattern; pick the closest
  `skills/product-archetype/<archetype>` for this product's shape first, then
  layer `platform` + `auth` + `quality` + `growth` + `monetization` skills.
- Families: ai, auth, control, data, growth, integrations, messaging, mobile,
  monetization, platform, product-archetype, publishing, quality,
  site-execution, strategy, ui.
- One logical unit per commit. Update `docs/BACKLOG.md` checkboxes and
  `docs/HANDOFF.md` as you complete each unit.

## Verify before EVERY push (non-negotiable — these broke deploys before)
- Run tests + build on this repo's PINNED node version (its `Dockerfile` `FROM`
  and `.nvmrc` — currently node 22), NOT the machine default (node 24). Use
  `fnm exec --using=22 npm test`, or hermetically
  `docker run --rm -v "$PWD":/app -w /app node:22-alpine sh -c 'npm ci || npm install; npm test'`.
- If the Dockerfile has a build/test (check) stage, run `docker build .` to prove
  the image actually builds (a passing local `npm test` is NOT proof the image
  builds — missing COPYs and node-version drift both hide there).
- A story is Done only when implemented AND covered by a test that goes red on
  regression and green on the pinned node.

## Deploy facts — keep Coolify green
- Hosting: Coolify on the Hetzner box; it auto-deploys on push to `main`.
- From inside a container the Postgres host is `10.0.1.1` (NOT `127.0.0.1`,
  which is the container's own loopback). This app's production env lives in
  `~/dotenv/costcap/.env.persooninc1` (and `.env.local`).
- The app must start cleanly and serve its health endpoint (`/health` or
  `/healthz`) with 200, or the deploy goes unhealthy.

## Endpoint / domain wiring
- The app's live endpoint is its Coolify URL (currently a `*.sslip.io`
  placeholder). Keep it serving 200 there.
- This product's real domain is OWNED (the owner/Instinct registered it and
  controls DNS — nothing to buy). The domain is the repo slug when the slug is a
  domain (e.g. `onceprobe.io`), otherwise the `*_ORIGIN` / `SITE_URL` in
  `~/dotenv/costcap/.env.persooninc1`.
- The box serves Coolify apps on public IPv4 `2.29.29.67` (AAAA
  `2a01:4f9:c015:7bf2::1`). Wiring the real endpoint = (1) a DNS A record
  `<domain> -> 2.29.29.67` and (2) the app's FQDN set to `https://<domain>` in
  Coolify (which then issues Let's Encrypt TLS). You MAY set the Coolify FQDN;
  you must NOT edit DNS yourself — write the exact A record needed into the Owner
  enablement queue in `docs/HANDOFF.md` for the owner to apply. Keep serving on
  the sslip URL until the domain resolves.
- Once DNS is live, point the app's own `*_ORIGIN` / `SITE_URL` env at the real
  domain so links, emails, and canonicals are correct.

## Run migrations on deploy (so the prod DB actually gets its schema)
- Committed migration files are NOT enough: the Path A Postgres DB on the box
  stays EMPTY until the app applies them. Wire migrations to run automatically on
  deploy — either at container boot (entrypoint runs the migrate step before
  serving) or as a Coolify pre-deploy command — against DB host `10.0.1.1` with
  creds from `~/dotenv/costcap/.env.persooninc1`.
- A schema-changing story is Done only when the deploy path applies the migration
  AND the running app serves against the migrated DB. Verify locally on node 22
  against a disposable Postgres; the real apply happens on deploy. If this product
  is stateless (no DB), say so in `docs/HANDOFF.md` and skip this.

## git
- Commit logical units and push to `main` (`git push origin HEAD:main`). On a
  rejected push, `git fetch` + rebase and retry — never force, never
  `git add -A` blindly (add only the files your change touched).

## Parked residue — never do autonomously (full list in AUTONOMOUS_EXECUTION_PROMPT.md)
- No writes to any prod/live datastore, no spending money, no creating billable
  cloud resources, no destructive git, no secrets in tracked files. Mock metered
  third-party APIs. Build and test against local/mock only; append anything that
  needs the owner (live keys, DB provisioning, domain, Stripe live) to the Owner
  enablement queue in `docs/HANDOFF.md` and keep going.
