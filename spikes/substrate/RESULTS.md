# Spike results (local baseline, not a substrate run)

Command: `node spikes/substrate/demo.mjs`

```
1. register: token issued, auth ok = true | wrong token ok = false
2. policy: version 2 caps {"run":0.5} source server
   call 1 (spent $0.00 of $0.50): HTTP 200 
   call 2 (spent $0.25 of $0.50): HTTP 200 
   call 3 (spent $0.50, cap reached): HTTP 429 {"type":"budget_exceeded","message":"CostCap: run cap of $0.5 reached ($0.5 spent). The upstream call was not made.","scope":"run","cap_usd":0.5,"spent_usd":0.5}
   upstream calls so far: 2
   3. kill: call while killed: HTTP 429
   upstream untouched while killed: true
      call after resume: HTTP 200
DONE
```

## What it shows
- Register: token issued once, only its hash stored; wrong token rejected.
- Policy: a fleet policy (run cap $0.50) became the enforced cap via resolvePolicy.
- Hard stop: with the fallback rate, each call costs $0.25. Calls 1 and 2 pass, call 3 returns 429 and upstream is not called.
- Kill: while the kill file exists the proxy returns 429 and upstream is untouched; resume restores service.

## Findings (what a substrate must handle or we must shim)
1. The cap check runs before each call using spend so far, so the final allowed call can overshoot the cap by up to one call's cost. Fine for guardrails, but the docs must say so; a substrate that offers pre-authorised spend reservations would be tighter.
2. Policy delivery is pull-based (fetched or last-known). A substrate needs push or short polling for kill to reach agents quickly; the local file works because it is on one machine. Cross-machine kill is untested.
3. Kill here is a file. A multi-host fleet needs the substrate to carry the kill flag and the agent credential check; the demo only proves the logic.
4. Not tested: any real substrate, any network hop, receipts sync, concurrent agents.
