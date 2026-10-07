# Autonomous loop

Use this prompt for the next session. One story per commit. Stop the story when its acceptance criteria are evidenced. Do not stop the loop while a `ready` issue remains.

## Prompt

Read docs/VISION.md, docs/ARCHITECTURE.md, docs/product-spec.md, docs/adr/, FEATURE-COMPLETE.md, and the open GitHub issues. Then repeat:

1. Select the oldest open issue labeled `ready` and `priority-p0`. If none, use `priority-p1`, then `priority-p2`. Skip `blocked`. Skip an issue whose "Depends on" issues are open.
2. Design the change against the issue's acceptance criteria. Implement it in this repository. Production behavior must not depend on a manual server edit.
3. Infrastructure changes belong in git: Dockerfile, Compose, and GitHub Actions. Do not change DNS, cloud consoles, or production hosts by hand. If the required secret or host is absent, leave the issue `blocked` and name the secret. Do not invent it.
4. Keep `permissions: contents: read` unless a job writes a release artifact. Secrets stay in GitHub environments. Do not print them. Do not add a second mail provider. Billing stays disabled unless issue #43 is closed on Stripe readback.
5. Add tests that execute the real code. Unit, API, and regression tests use `node --test`. Playwright (#38) drives the real server. Security tests run the scanner. IaC tests run `docker compose config` or an equivalent validator. Do not skip tests. Do not mock the function under test.
6. Run `npm ci`, `npm audit --audit-level=high`, `npm run security`, `npm test`, and `npm run acceptance:runaway`. Push to `main` and wait until the verify workflow is green. Fix failures in new commits. Do not use `--no-verify`.
7. Update the issue checklist, docs/BACKLOG.md, and an ADR when a decision changes. Comment with the CI URL. Close the issue only after every checkbox is evidenced. `implemented-local` is not closed.
8. Commit and push to `main`. One story per commit. The body names the issue. Use `Fixes #N` only when the close is justified.
9. List remaining `ready` and `blocked` issues. Add a new issue if the goal in docs/VISION.md is still unmet. Continue at step 1.

## Stop conditions

Stop the loop only when no `ready` issue remains and every `blocked` issue names the missing credential, host, or calendar evidence. Do not mark the platform production-ready while #40, #41, or #45 are open.
