# Substrate decision (input to #19, epic #16)

Evidence only, from public pages read on 2026-10-02. No code was run and nothing was integrated.

Evaluations: docs/openclaw-enterprise-evaluation.md (#17) and docs/engrams-evaluation.md (#18).

## Recommendation (for #19)
1. CostCap CLI: build custom, no substrate. The zero-infra local proxy is the product. Keep the seam in spikes/substrate/ so a substrate can be added later.
2. OCE: partial, later. Treat it as an optional enrolled-agent target: when an org runs OCE, the hosted dashboard's kill can call the OCC stop endpoint. Revisit after OCE 1.0 and after M2. Before any commitment, read OCE's cost and observability docs for budgets or metering that could replace parts of the hosted design.
3. engrams: reject as a substrate for CostCap. AGPL, a different product class, and heavy infrastructure. Watch its credential broker design as a reference for KeyLeash.
4. Epic #16 should be re-scoped from "adopt as substrate" to "integrate with OCE later". The hosted dashboard, caps and receipts stay custom.

## Limits of this evaluation
Public docs only. I did not read OCE or engrams source, run either, or verify performance claims. The kill-latency and cost-feature gaps above are "not found in pages read", not confirmed absences.
