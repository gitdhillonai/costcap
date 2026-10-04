// Read-only CI guard: rejects unknown cost rather than treating it as free.
import { loadReceipts, createCapEngine } from "./cap.js";
export function checkBudget({ receiptsPath, caps = {}, now }) {
  const history = loadReceipts(receiptsPath);
  if (!history.length) throw new Error("No receipts found; a budget check needs evidence");
  const cap = createCapEngine({ caps: { day: caps.day, month: caps.month }, history, now });
  const s = cap.spend();
  const total = history.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  let hit = cap.check();
  if (!hit && caps.run != null) {
    if (!Number.isFinite(caps.run) || caps.run <= 0) throw new Error("Invalid run cap");
    if (total >= caps.run) hit = { scope: "run", cap: caps.run, spent: total };
  }
  return { ok: !hit, receipt_count: history.length, total_usd: Number(total.toFixed(6)), spend: s, hit,
    estimate_only: true, scope: "all receipts in selected ledger; run total is not a reconstructed process run" };
}
