// Cap engine: tracks spend per run/day/month and decides whether the next
// upstream call may happen. Hard stop: when a cap is reached the proxy never
// forwards the call. Spend is measured from receipts, so it only covers
// traffic that flows through the proxy.

import { readFileSync, existsSync } from "node:fs";

export function loadReceipts(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// caps: { run, day, month } in USD; any may be undefined.
export function createCapEngine({ caps = {}, history = [], now = () => new Date() } = {}) {
  for (const scope of ["run", "day", "month"]) {
    if (caps[scope] != null && (!Number.isFinite(caps[scope]) || caps[scope] <= 0)) throw new Error(`Invalid ${scope} cap`);
  }
  for (const r of history) {
    if (!Number.isFinite(Date.parse(r.ts)) || (r.cost_usd !== null && (!Number.isFinite(r.cost_usd) || r.cost_usd < 0))) throw new Error("Invalid receipt history; reconcile before running");
  }
  let run = 0;
  const uncertain = history.some((r) => r.cost_usd === null);
  const entries = history.map((r) => ({ ts: new Date(r.ts), cost: r.cost_usd ?? 0 }));
  const sum = (pred) => entries.filter(pred).reduce((a, e) => a + e.cost, 0);

  function spend() {
    const n = now();
    const day = sum((e) => e.ts.toISOString().slice(0, 10) === n.toISOString().slice(0, 10));
    const month = sum((e) => e.ts.toISOString().slice(0, 7) === n.toISOString().slice(0, 7));
    return { run, day, month };
  }

  return {
    spend,
    updateCaps(next) {
      for (const scope of ["run", "day", "month"]) if (next[scope] != null && (!Number.isFinite(next[scope]) || next[scope] <= 0)) throw new Error("Invalid updated caps");
      caps = { ...next };
    },
    // Returns null if the call may proceed, else a budget-exceeded descriptor.
    check() {
      if (uncertain) return { scope: "accounting", cap: 0, spent: 0, reason: "unreconciled_receipt" };
      const s = spend();
      for (const scope of ["run", "day", "month"]) {
        const cap = caps[scope];
        if (cap != null && s[scope] >= cap) {
          return { scope, cap, spent: Number(s[scope].toFixed(6)) };
        }
      }
      return null;
    },
    record(receipt) {
      run += receipt.cost_usd ?? 0;
      entries.push({ ts: new Date(receipt.ts ?? now()), cost: receipt.cost_usd ?? 0 });
    },
  };
}

export function budgetExceededBody(hit) {
  return {
    error: {
      type: "budget_exceeded",
      message: `CostCap: ${hit.scope} cap of $${hit.cap} reached ($${hit.spent} spent). The upstream call was not made.`,
      scope: hit.scope,
      cap_usd: hit.cap,
      spent_usd: hit.spent,
    },
  };
}
