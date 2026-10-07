# ADR 0009: DNS records are not applied

Date: 2026-10-07. Status: accepted for the record file. This does not change DNS.

## Decision

`infra/dns/costcap.dev.json` names the existing `costcap.dev` zone and the `@` and `app` records. `.github/workflows/dns.yml` runs `scripts/dns-preflight.mjs`, which exits 2 when `COSTCAP_DNS_TOKEN` is missing and also exits 2 when it is present. The script does not call a DNS API.

## Consequences

Issue #44 stays open until a workflow log shows an apply and a completed TLS handshake. No domain is registered.
