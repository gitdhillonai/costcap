# Accounts

Names and where secrets live. This file has no keys, tokens, or inbox passwords.

| Service | Identity | Used for | Secret location |
|---|---|---|---|
| GitHub | `persooninc/costcap` | Source, Actions, composite Action in `action.yml` | GitHub Actions secrets and environments. Not in git. |
| Hetzner / Coolify | Existing persooninc host, app role `costcap` | Hosted beta when the deploy workflow has host credentials | Host env file outside this repo |
| Brevo | Transactional sender | Sign-in codes and alert mail after an owner installs the key | Deployment secret. Not committed. |
| Cloudflare Turnstile | Hostname-matched widget | Hosted sign-in | Site key is public via `/ui/config`. Secret stays in deployment config. |
| Cloudflare DNS | Existing `costcap.dev` zone | Intended public name. Not applied from an agent session. | DNS provider credential. Issue #44 is blocked. |
| Stripe | Persoon.ai Inc staging account named in `env.example` | Optional hosted plan after live readback | Restricted key, webhook secret, price id. Not in git. Do not change prices from an agent session. |
| npm | Not published | Intended CLI distribution | `NPM_TOKEN` is not configured. Issue #5 is blocked. |

`accounts/README.md` is the shorter portfolio table. Pull local values with `scripts/pull-secrets.sh` into an untracked env file. `env.example` lists names only.
