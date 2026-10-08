// Compare local receipts with a provider charge file. This does not call a provider.
// Unknown receipt cost is never treated as zero, and a missing charge is not a match.
import { loadReceipts } from "./cap.js";

export function reconcile({ receipts, charges }) {
  if (!Array.isArray(receipts) || !receipts.length) throw new Error("No receipts found; reconciliation needs evidence");
  if (!Array.isArray(charges)) throw new Error("Provider charges must be a list");
  const byId = new Map();
  for (const charge of charges) {
    if (!charge || typeof charge.id !== "string" || !charge.id) throw new Error("Provider charge needs an id");
    if (charge.cost_usd !== null && (typeof charge.cost_usd !== "number" || !Number.isFinite(charge.cost_usd) || charge.cost_usd < 0)) throw new Error("Provider charge cost must be a non-negative number or null");
    if (byId.has(charge.id)) throw new Error("Duplicate provider charge id");
    byId.set(charge.id, charge);
  }
  const unknown = [];
  const receiptOnly = [];
  const mismatched = [];
  const seen = new Set();
  let matched = 0;
  for (const receipt of receipts) {
    if (!receipt || typeof receipt.id !== "string" || !receipt.id) throw new Error("Receipt needs an id");
    if (seen.has(receipt.id)) throw new Error("Duplicate receipt id");
    seen.add(receipt.id);
    if (receipt.cost_usd === null) { unknown.push(receipt.id); byId.delete(receipt.id); continue; }
    if (typeof receipt.cost_usd !== "number" || !Number.isFinite(receipt.cost_usd) || receipt.cost_usd < 0) throw new Error("Receipt cost must be a non-negative number or null");
    const charge = byId.get(receipt.id);
    if (!charge) receiptOnly.push(receipt.id);
    else if (charge.cost_usd === null || Math.abs(charge.cost_usd - receipt.cost_usd) > 0.000001) mismatched.push(receipt.id);
    else matched += 1;
    byId.delete(receipt.id);
  }
  const providerOnly = [...byId.keys()];
  return { ok: unknown.length === 0 && receiptOnly.length === 0 && providerOnly.length === 0 && mismatched.length === 0,
    matched, unknown, receipt_only: receiptOnly, provider_only: providerOnly, mismatched, estimate_only: false };
}

export function reconcileFiles({ receiptsPath, providerPath }) {
  return reconcile({ receipts: loadReceipts(receiptsPath), charges: loadReceipts(providerPath) });
}
