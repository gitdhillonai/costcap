# Hosted dashboard design (stories #12, #13, #14)

Draft. Nothing here is deployed. The hosted stack depends on epic #16 (adopt OpenClaw Enterprise / engrams): if that substrate is chosen, `src/hosted/*` stays as stack-agnostic logic and the tables below map onto it.

## #12 Org-first auth
- Company email signs up -> company org created or joined by verified domain. No orphan users. Personal-domain emails (gmail.com etc.) get their own single-member org.
- Email verification required before an org can enroll agents or change caps. Turnstile on signup, login and password reset.
- Roles: owner, admin, viewer. Only owner/admin raise caps or kill.
- Tables: orgs(id, name, domain, created_at), users(id, email, email_verified_at, org_id, role), sessions.
- Not in this patch set: UI and framework auth wiring (no hosted app in the repo yet).

## #13 Enrollment + policy sync
- Org admin creates an enrollment token (shown once, stored as SHA-256 hash). `costcap enroll <token>` stores an agent credential locally.
- CLI fetches the policy on start and every 60s. Policy = {version, caps{run,day,month}, killed}.
- Offline = last-known policy keeps being enforced. Only a newer valid version replaces it. Local flags can tighten, never loosen (src/hosted/policy.js).
- Receipts sync on reconnect, append-only, deduped by receipt id.
- Tables: agents(id, org_id, name, token_hash, last_seen_at), policies(org_id, agent_id nullable, version, caps jsonb, killed, updated_by), receipts(org_id, agent_id, id, ts, cost_usd, model, blocked, reason).
- Endpoints: POST /v1/enroll, GET /v1/policy, POST /v1/receipts.

## #14 Alerts + audit log
- Rules: cap_approaching (80%), cap_hit, loop_detected, agent_silent (default 6h). Fire once, re-arm after clearing (src/hosted/alerts.js).
- Channels: Resend email to org admins, Slack webhook per org. Missing delivery is logged, never silent.
- Audit log is append-only: who raised a cap, who killed an agent, when (auditEntry).
- Copy everywhere: guardrails, not guarantees.

## Open questions for Roger
- Trial and pricing ($19/mo, 14 days no card) are from the spec as pitch-level; confirm before any public pricing.
- Silent threshold default (6h) is a guess.
