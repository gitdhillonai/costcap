# CostCap local safety verification, 2026-10-04

Baseline: 42 tests passed. Patched: 53 tests passed on Node 22.
`npm pack --dry-run` succeeded. No paid provider call was made.

Added regression proof:
- Concurrent requests serialize, one request reaches upstream before cap stop.
- Blocked requests persist to a newly created nested receipt directory with IDs.
- Gemini cached/output/reasoning and Anthropic streaming start/delta usage parse.
- OpenAI Responses API usage parses. Missing and negative usage do not bill zero.
- Missing usage/timeout latch unknown accounting and block a second upstream call.
- Unknown-cost receipts block wrapper restart; malformed history is not ignored.
- Receipt ledgers cannot be acquired by two wrappers.
- Same-version policies cannot loosen caps or clear a kill flag.
- Corrupt cached policy/local caps are refused.
- Oversized bodies are refused before the provider call.

Not verified: provider bill reconciliation, live SDK usage, hosted service,
real email/Slack delivery, production deploy, npm publication, remote kill,
two-week fleet dogfood, any actual OCE or engrams runtime.

The existing cap is post-response. One accepted request can overshoot. This
patch does not claim a strict pre-authorized dollar ceiling. Separate ledgers
have independent daily/monthly caps. Streams remain buffered. Anthropic cache
creation is estimated at input rates; bill reconciliation is still needed.

Suggested closure: #19 after this plan lands on main and epic links are updated.
No other issue is fully live-verified by these local tests alone.

## Additional locally tested work

63 tests pass after client/distribution/delivery additions:
- Enrollment handshake with test HTTP server, mode 0600 credential cache.
- Policy refresh, cached restart, offline last-known, same-version no-resume.
- Receipt acknowledgments dedupe, authorization failures latch revocation.
- Read-only MCP initialize/list/call/stdin framing.
- CI check exit statuses and unknown/missing evidence rejection.
- Email/Slack delivery adapter with mock fetch only: unconfigured, accepted,
  failed and invalid webhook-origin cases. No email or Slack message was sent.

This adds client and adapters, not a hosted dashboard. #11/#12/#14 and deployment
remain open. #13 still needs end-to-end service verification. #15 still needs
real publication/listings and legal fields. No work in other repositories.
