// Public evidence is bounded to a reproducible local test, not a live fleet claim.
export const offlineProof = `CostCap: offline policy proof

What is proved
- A wrapper with a cached frozen policy refuses proxy-routed upstream requests
  while the control plane is unreachable, including after two wrapper starts.
- An unfrozen offline cache keeps its caps. Network loss alone does not freeze it.
- Existing tests cover newer policy versions, refusal to resume on the same
  version, and freezing on a 401/403 credential rejection.

Reproduce from the source checkout, Node 20 or newer:
  node --test test/offline-proof.test.js test/fleet-client.test.js test/wrap-policy.test.js

Method
The new offline test uses an unreachable loopback control-plane port and a
local mock provider. It asserts HTTP 429, a killed receipt, and zero upstream
hits across two wrapper starts. It also verifies an unfrozen cache stays
unfrozen with its existing cap. No provider bill or production fleet was used.

Limits
This is cached-policy enforcement, not delivery of a new remote freeze through
a disconnected network. Connected agents poll once per minute. SDKs that ignore
provider base URLs bypass CostCap. An accepted provider request can exceed the
remaining receipt-based cap. SSE is buffered. Separate receipt ledgers do not
share budgets. Costs are estimates, not provider bills. Unknown usage pauses
further requests instead of being counted as free.

The CLI remains free. This proof does not certify live billing, email delivery,
provider SDK compatibility, deployment identity, or a two-week dogfood run.
`;
