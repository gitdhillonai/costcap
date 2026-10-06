# Accounts and APIs used by costcap (no secrets in this file)

| Service | Account / identity | Used for | Secret location |
|---|---|---|---|
| GitHub | gitdhillonai | repo, Action, marketplace listing | dotenv shared |
| Hetzner persooninc1 | Coolify app, own DB+role `costcap` | hosted dashboard | Coolify secrets |
| Brevo | transactional sender (TODO until the deploy agent installs BREVO_API_KEY) | sign-in and invite mail | dotenv costcap/.env.local, not this repo |
| Stripe | staging account (per portfolio rule) | $19/mo hosted billing (M3) | dotenv |
| npm | gitdhillonai/persoon scope (TODO at launch) | CLI publish | vault |
