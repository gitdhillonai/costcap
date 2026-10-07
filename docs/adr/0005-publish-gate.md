# ADR 0005: Publish gate does not publish

Date: 2026-10-07. Status: accepted for the pack check. This is not a registry release.

## Decision

`scripts/pack-check.mjs` runs `npm pack --dry-run` and allows `package.json`, `README.md`, `LICENSE`, and `src/` only. `.github/workflows/publish.yml` runs that check and `scripts/publish-preflight.mjs`. The preflight exits 2 when `NPM_TOKEN` is missing and also exits 2 when the token is present. The workflow contains no `npm publish` command.

## Consequences

Issue #5 stays open until a workflow log shows a registry readback of version, dist-tag, and integrity. This gate does not publish from a laptop or from CI.
