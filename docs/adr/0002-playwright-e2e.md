# ADR 0002: Playwright drives the real hosted server

Date: 2026-10-07. Status: accepted for the local and CI browser gate. This is not a production login.

## Decision

`e2e/hosted.spec.js` starts `createHostedServer` from `src/hosted/server.js` and drives the HTML that server returns. Turnstile's browser script is replaced in the test with a local callback. Mail is captured by the `sendCode` and `sendInvite` arguments. The production launcher in `src/hosted/run.js` rejects `COSTCAP_TURNSTILE_FIXTURE` and `COSTCAP_EMAIL_FIXTURE`, and it calls `verifyProductionChallenge`, which posts to Cloudflare siteverify.

## Consequences

A green Playwright job does not prove production login, alert delivery, or a deploy. Those stay on #45 and #41. The verify workflow's `e2e` job may use `actions: write` only to upload a trace after failure. The unit job stays `contents: read`.
