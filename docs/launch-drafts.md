# CostCap launch drafts

DRAFTS ONLY. Publish after the release gates in billing-readiness.md pass.
No posting credentials or account grants are implied. Do not claim the source
is public until the repository or a release has actually been published.

## Show HN
Title: Show HN: CostCap - local spend guardrails for proxy-routed AI agents
Body: CostCap wraps an agent in a local metering proxy. It records usage,
stops subsequent calls at receipt-based caps, catches repeat patterns and
supports a local kill file. Enrolled agents cache their last-known policy.
The important limits: a request can overshoot a cap, an offline agent cannot
receive a new remote freeze, and SDKs that bypass the proxy bypass CostCap.
CLI source: [verified public release URL required]. Hosted beta:
https://app.costcap.dev/. Reproducible offline proof: [verify deployed proof URL].
I'm looking for agent builders who can test it against their own SDK and share
where the receipt estimate differs from their provider bill.

## r/LocalLLaMA
Title: Testing local spend guardrails for agent retries: what would you measure?
Body: CostCap wraps supported provider traffic in a local proxy, with run/day/
month caps and retry-pattern checks. It does not claim a provider-bill guarantee.
An already accepted call can overshoot; offline agents keep cached policies.
If you run mixed local/cloud agents, which bypasses or accounting gaps should
we test first? [Only include product/source links if the current rules permit.]

## LangChain community
Built CostCap for agents whose model calls honor provider base URLs. I'm looking
for a LangChain user to test proxy routing, retries and unknown-usage handling.
The CLI is free; receipts are estimates. No network disconnect magic: remote
freeze arrives only when the enrolled client can poll. Would someone test a
small script and compare the receipts with provider usage? [Verified source link]

## CrewAI community
CostCap adds local receipt-based caps around proxy-routed agent calls. Before
we make compatibility claims, we'd like a CrewAI builder to test one real flow,
including retry loops and subprocesses that may bypass the proxy. [Source link]

## First-10 experiment queue
1. Show HN, current posting guidelines checked before submitting.
2. r/LocalLLaMA discussion, current self-promotion rules checked first.
3. LangChain help/showcase channel, ask permission if links are restricted.
4. CrewAI help/showcase channel, same rule check.
5. One small OpenAI SDK script with a volunteer builder.
6. One Anthropic SDK script with a volunteer builder.
7. One Gemini SDK script with a volunteer builder.
8. One OpenRouter SDK script with a volunteer builder.
9. One multi-process flow to test bypass and ledger boundaries.
10. One enrolled fleet flow with a disconnected control plane.

These are experiment targets, not ten contacted customers. No invented names,
no scraped addresses, no posting volume promise, no paid promotion. Measure
visits -> signup -> enrollment -> useful receipt -> voluntary paid upgrade.
Log failed compatibility tests as well as successes.
