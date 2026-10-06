# Free-beta hosted workspace

The same-origin root page serves email-code login with the configured production Turnstile site key, then fleet view, enrollment-token creation, caps, freeze/resume, revoke, alerts and audit log. Billing is disabled. The CLI stays free.

Set TURNSTILE_SITE_KEY as well as TURNSTILE_SECRET_KEY. The public key is returned from /ui/config; the secret never reaches the browser. CSP allows only this site's scripts and Cloudflare's challenge script/frame. API session cookies remain HttpOnly, Secure and SameSite=Strict. No enrollment token or session data is stored in browser storage. Fleet fields render with textContent, not HTML.

New emails create separate organizations. Shared email domains are not membership proof. Invite/member management is not yet implemented. Deployment remains exactly one process with a persistent JSON store, not Postgres or a high-availability service. Alerts need a separately configured owner-approved destination. Provider-bill reconciliation, streaming UX and two weeks of fleet dogfood remain separate acceptance work.

Receipt-based caps may overshoot by one accepted request. Freeze/resume is policy sync: offline agents retain the last-known policy and cannot receive a new remote freeze until reconnecting. Only proxy-routed traffic is enforced. The dashboard shows synced reported costs and separately counts unknown-cost receipts; it is not a provider bill.

Deployment: retain /opt/costcap/data, apply the completed private env, build/recreate the Docker container, then check /health, /, /ui/config and a real challenge + email-code login. Local test challenges are fixture-only and never enabled by the production launcher.

Local verification command: `npm test`. On a machine with Google Chrome, `node scripts/ui-browser-smoke.mjs` exercises the UI against a local-only challenge fixture and fake email transport: login, enrollment, XSS-safe agent name, caps, freeze/resume, revoke, logout. It sends no external email and does not alter production Turnstile behavior.
