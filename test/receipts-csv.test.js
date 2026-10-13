import test from "node:test";
import assert from "node:assert/strict";
import { receiptsCsv, RECEIPT_CSV_LIMIT } from "../src/hosted/receipts-csv.js";

test("receipt csv quotes formulas and keeps an empty cost empty", () => {
  const { body, truncated, count } = receiptsCsv([
    { ts: "2026-10-13T00:00:00.000Z", agent_id: "a", receipt_id: "1", model: "=cmd()", cost_usd: "", reason: "+sum", scope: "day" },
    { ts: "2026-10-12T00:00:00.000Z", agent_id: "a", receipt_id: "0", model: "gpt", cost_usd: 1.5, reason: "", scope: "" },
  ]);
  assert.equal(truncated, false);
  assert.equal(count, 2);
  const lines = body.trim().split("\n");
  assert.equal(lines[0], "ts,agent_id,receipt_id,model,cost_usd,reason,scope");
  assert.equal(lines[1], "2026-10-12T00:00:00.000Z,a,0,gpt,1.5,,");
  assert.equal(lines[2], "2026-10-13T00:00:00.000Z,a,1,'=cmd(),,'+sum,day");
});

test("receipt csv keeps only the newest rows past the limit", () => {
  const rows = ["a", "b", "c", "d"].map((id, i) => ({
    ts: `2026-01-0${i + 1}T00:00:00.000Z`,
    agent_id: "agent",
    receipt_id: id,
    model: "m",
    cost_usd: 0,
    reason: "",
    scope: "",
  }));
  const { truncated, count, body } = receiptsCsv(rows, { limit: 2 });
  assert.equal(truncated, true);
  assert.equal(count, 2);
  assert.match(body, /,c,m,/);
  assert.match(body, /,d,m,/);
  assert.doesNotMatch(body, /,a,m,/);
  assert.equal(RECEIPT_CSV_LIMIT, 5000);
});
