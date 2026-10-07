# ADR 0003: Hosted request logs

Date: 2026-10-07. Status: accepted.

## Decision

Each hosted response writes one JSON line to stderr: `method`, `path`, `status`, and `durationMs`. The path is the URL pathname. The line is built from those four fields only, so emails, cookies, authorization, invite tokens, and mail bodies are not logged.

## Consequences

The line is an access log, not an audit log. Audit entries remain in the store. A log sink error does not change the HTTP response. `/health` still reports `billing: disabled` and does not echo request secrets.
