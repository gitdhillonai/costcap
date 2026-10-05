# CostCap email provider

COSTCAP_EMAIL_PROVIDER=brevo selects the free-tier provider explicitly. Set
BREVO_API_KEY and a verified costcap.dev sender in COSTCAP_EMAIL_FROM. The
Resend adapter remains supported with COSTCAP_EMAIL_PROVIDER=resend and
RESEND_API_KEY. No silent provider fallback, no account upgrade, no bulk sends.

Brevo free allowance is 300/day, with sending account approval required. Daily
quota exhaustion can delay verification mail. Keep the free beta rate-limited.
Acceptance of an API call is not proof of inbox delivery. Live code login is
still blocked until account approval, domain verification, authorized testing
and secure server env installation are done. No live mail was sent for tests.

Vault: CostCap production Turnstile (username=public site key, password=secret).
The secret must not appear in this repo. Deployment is /opt/costcap direct Docker
behind Traefik, not a Coolify application, as reported by the deployment lane.

Sources verified 2026-10-05:
https://developers.brevo.com/reference/sendtransacemail
https://www.brevo.com/free-smtp-server/
https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
