# Hosted beta deployment contract

This service is implemented and locally tested, not live-verified. Free beta,
billing disabled. No marketplace or npm release is implied.

- One process/replica only; local JSON datastore, atomic rename, mode 0600.
  This is not the planned Postgres service. Never horizontally scale it. Restart
  uses the same durable volume. Volume backups and restore proof required.
- TLS ingress, COSTCAP_ORIGIN exact HTTPS origin, persistent writable /data
  volume owned by container UID 1000. Health route GET /health. PORT defaults 3000.
- TURNSTILE_SECRET_KEY and hostname-matched Turnstile validation required.
  TURNSTILE_SITE_KEY is public and is returned by GET /ui/config.
- COSTCAP_EMAIL_PROVIDER=brevo, BREVO_API_KEY and COSTCAP_EMAIL_FROM required.
  The launcher rejects any other mail provider. Live sends require a verified
  sending domain and authorized transactional-email scope. No sends occurred
  during this change. Alert mail destination and Slack webhook are deployment
  configuration and COSTCAP_ALERT_ORG_ID must match the explicitly authorized org,
  not inferred from owner profiles or repository documents.
- Optional COSTCAP_ALERT_EMAILS comma-separated recipients and
  COSTCAP_SLACK_WEBHOOK, only if explicitly authorized for the org deployment.
  This beta supports one global channel configuration, not arbitrary customer
  org notification destinations. Do not onboard unrelated customer orgs.
- Auth: POST /auth/request with email/turnstileToken, POST /auth/verify with
  challengeId/code. HttpOnly SameSite Strict cookies, exact Origin checks on
  browser mutations. New verified email creates its own org; matching domains
  alone never join an existing org. Invitations/teams are not implemented.
- Verified owners can issue one-use 10-minute enrollment tokens. Agent bearer
  credentials can only read their policy and submit their own receipts.
- POST /v1/agents/{id}/policy modifies caps/killed state with atomic versions;
  POST /v1/agents/{id}/revoke invalidates credentials.
- GET /v1/fleet returns only session org's agents, receipts, audit and alerts.
- /v1/receipts acknowledges only after a durable transaction. Duplicate ID with
  changed content returns 409. Receipt trust is agent-reported, not billing proof.
- Alert sweeps once per minute with dedupe, retry and delivery audit. HTTP
  accepted is not confirmed inbox delivery. Unknown costs stay unknown.

## What the push/deploy agent must provision

This repo change does not deploy, change DNS, or create a volume. The image
needs all of the following before a new container can replace the running one:

- One replica only. Do not scale the JSON datastore horizontally.
- A persistent writable volume mounted at `/data`, owned by container UID 1000,
  surviving recreate. `COSTCAP_STORE_PATH` defaults to `/data/costcap.json`.
  Volume backup and restore are not proven by the tests in this repo.
- TLS ingress in front of `PORT` (default 3000). `COSTCAP_ORIGIN` must be the
  exact public HTTPS origin. The health check inside the image calls
  `GET /health` on 127.0.0.1.
- `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` for that hostname.
- `BREVO_API_KEY` and `COSTCAP_EMAIL_FROM` for a verified Brevo sender.
  Do not set a Resend key. The process will not start with another provider.
- Optional `COSTCAP_ALERT_EMAILS`, `COSTCAP_SLACK_WEBHOOK`, and
  `COSTCAP_ALERT_ORG_ID` only when that org was explicitly authorized.
- Names and empty values are listed in `env.example`. Secrets stay out of git.

## Still required before acceptance

Hosted dashboard UI, Postgres/RLS migration, team invitations, restore test,
production Turnstile/email delivery, live enrolled-client sync, real provider
receipt reconciliation, two weeks of authorized fleet dogfood, secure ingress,
CI green, deployment readback. #11/#12/#13/#14 remain open until these match their
actual acceptance. Local tests do not certify externally deployed auth.
