# ADR 0001: CI security gates

Date: 2026-10-07. Status: accepted for the local and CI gate. This is not a certification.

## Decision

Every push runs, with `contents: read`:

- `npm ci` from `package-lock.json`
- `npm audit --audit-level=high`
- `node scripts/security-scan.mjs` over tracked text
- `npm test` and `npm run acceptance:runaway`

Actions are pinned to commit SHAs. Dependabot opens weekly updates for npm and GitHub Actions. The image `USER` is `node`, not root.

## Rules

The scanner rejects private keys, AWS access-key ids, Brevo API tokens, Stripe live secrets, the Resend API host, dynamic code execution, and DOM HTML assignment sinks. Tests construct those strings by concatenation so the fixtures are not themselves findings.

## Consequences

A clean scan is not a penetration test. Production login, alert delivery, and deploy remain blocked until their own issues have live evidence.
