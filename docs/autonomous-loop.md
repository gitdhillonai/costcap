# Code-complete loop

Paste the prompt below into a new session. One story per commit. Code complete is a repository state. It is not production-ready.

## Code complete

Code complete means all of the following are true:

- A fresh clone passes `npm ci`, `npm audit --audit-level=high`, `npm run security`, `npm test`, `npm run e2e`, and `npm run acceptance:runaway`.
- Every product behavior that does not need a live credential has an implementation and a test that executes the real code.
- Deploy, publish, canary, database, DNS, and billing gates exist in git. Each one fails closed when its secret or host is absent.
- Every still-open issue names the exact missing credential, host, or calendar evidence. No checkbox is checked without that evidence.

Production-ready is a later state. Do not use that phrase while #40, #41, or #45 is open. Billing stays disabled. Do not close #5, #10, #12, #13, #14, #15, #16, #40, #41, #42, #43, #44, or #45 from this loop.

## Prompt

Read docs/VISION.md, docs/ARCHITECTURE.md, docs/product-spec.md, docs/adr/, docs/BACKLOG.md, FEATURE-COMPLETE.md, and the open GitHub issues. Then repeat:

1. Select work. Take the oldest open issue labeled `ready` and `priority-p0`. If none, use `priority-p1`, then `priority-p2`. Skip `blocked`. Skip an issue whose Depends-on issues are open. If nothing is `ready`, file the missing code-complete stories below, label them `story`, `ready`, and the listed priority, and select the first P0. Do not stop just because `ready` is empty.
2. Implement that story in this repository. Match its acceptance criteria. Production behavior must not depend on a manual server edit, a laptop publish, or a console click.
3. Keep infrastructure in git: Dockerfile, Compose, migrations, and GitHub Actions. Do not change DNS, cloud consoles, production hosts, or repository visibility by hand. If a secret or host is absent, fail closed and name the secret. Do not invent it. Do not print it.
4. Keep workflow `permissions: contents: read` unless a job only uploads a failure artifact or publishes a release. Secrets stay in GitHub environments. Mail is Brevo only. The default image has no charge call. `COSTCAP_BILLING` stays unset. The JSON store stays the only running backend until a production readback exists.
5. Add tests that execute the real code. Unit, API, and regression tests use `node --test`. Playwright drives the real server. Security tests run the scanner. IaC tests run `docker compose config` or the workflow's own fail-closed check. Do not skip tests. Do not mock the function under test. A fixture that stands in for Turnstile or Brevo must fail if it is wired into `src/hosted/run.js`.
6. Run `npm ci`, `npm audit --audit-level=high`, `npm run security`, `npm test`, `npm run e2e`, and `npm run acceptance:runaway`. Push to `main` and wait until the verify workflow is green on Node 20, Node 22, and e2e. Fix failures in new commits. Do not use `--no-verify`.
7. Update the story checklist, docs/BACKLOG.md, and an ADR when a decision changes. Comment with the CI URL. Close the story only after every checkbox is evidenced. Leave the parent blocked issue open when its live checkbox is still unmet. `implemented-local` is not closed.
8. Commit and push to `main`. One story per commit. The body names the issue. Use `Fixes #N` only for a code-complete story whose close is already justified. Never use `Fixes` on #5, #10, #12, #13, #14, #15, #16, or #40 through #45.
9. Re-read the open issues against docs/VISION.md and docs/product-spec.md. File a new `ready` story for any product behavior that still has no code or no test. Continue at step 1.

## Stories to file when none are ready

File these only if an equivalent open issue does not already exist. Each stays a separate story from the live-proof issue it supports.

- P0. Compose and deploy workflow. `docker compose config` passes in CI. The workflow exits non-zero when `COSTCAP_ORIGIN`, the Turnstile keys, `BREVO_API_KEY`, or `COSTCAP_EMAIL_FROM` is missing. The definition is one replica, `/data` owned by UID 1000, and no second replica on the JSON file. Do not apply it and do not close #40.
- P0. npm publish workflow. CI checks that `npm pack` contains only `src/`, `README.md`, and `LICENSE`. The publish job exits non-zero when `NPM_TOKEN` is missing. Do not run `npm publish` and do not close #5.
- P0. Canary command. It requests `/health`, `/`, `/ui/config`, and unauthenticated `/v1/fleet`, and it fails unless health says billing is disabled, config has only `siteKey`, and fleet is 401. CI runs it against the local server. The deploy job runs it against `COSTCAP_ORIGIN` only after an apply. Do not close #41.
- P1. Postgres migrations. Schema, grants, a migration role, and an application role that does not own tables are files. A CI Postgres service proves apply and rollback. `/health` keeps reporting `single-process-file`. Do not point production at Postgres and do not close #42.
- P1. Billing guard. A test proves the default server has no charge route and ignores an attempt to enable billing without a Stripe readback. Do not add a Stripe client and do not close #43.
- P2. DNS and TLS workflow. The record file is in git. The job exits non-zero when the DNS credential is missing. Do not register a domain and do not close #44.
- P2. Live-proof workflow shell for login and alerts. It exits non-zero when the production Turnstile secret, Brevo key, or `COSTCAP_ALERT_ORG_ID` is missing. It must not send mail and must not print a code or a key. Do not close #45.

## Stop conditions

Stop when every story filed by this prompt is closed on a green verify URL, and every remaining open issue is `blocked` with the missing credential, host, or calendar evidence named in the issue body.

On that stop, report code complete and list the blocked issues. Do not report production-ready. Do not check a live checkbox because a local fixture passed. Do not mark work complete when a test is skipped, a security control is missing, IaC is only a manual step, or a production change still requires a person.
