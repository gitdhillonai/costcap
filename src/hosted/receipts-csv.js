// Session export of synced receipts. This is the operator's copy of what
// the proxy reported. It is not a provider bill.

const COLUMNS = ["ts", "agent_id", "receipt_id", "model", "cost_usd", "reason", "scope"];
export const RECEIPT_CSV_LIMIT = 5000;

function cell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+@\t\r]/.test(text) || /^-(?!\d)/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function receiptsCsv(rows, { limit = RECEIPT_CSV_LIMIT } = {}) {
  const sorted = [...rows].sort((a, b) => String(a.ts).localeCompare(String(b.ts)) || String(a.receipt_id).localeCompare(String(b.receipt_id)));
  const truncated = sorted.length > limit;
  const kept = truncated ? sorted.slice(sorted.length - limit) : sorted;
  const lines = [COLUMNS.join(",")];
  for (const row of kept) {
    lines.push(COLUMNS.map((key) => cell(row[key])).join(","));
  }
  return { body: `${lines.join("\n")}\n`, truncated, count: kept.length };
}
