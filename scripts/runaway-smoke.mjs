// Local fake-provider acceptance. No credentials, external requests or paid calls.
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = mkdtempSync(join(tmpdir(), "cc-runaway-"));
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
let hits = 0;
const up = http.createServer((req, res) => {
  hits++;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ model: "gpt-4o-mini", usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } }));
});
await new Promise((r) => up.listen(0, "127.0.0.1", r));

function scenario(name, flags, count, distinct = true) {
  hits = 0;
  const receipts = join(root, `${name}.jsonl`);
  const childCode = `for (let i = 0; i < ${count}; i++) { const r = await fetch(process.env.OPENAI_BASE_URL + "/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: ${distinct ? "String(i)" : "'same retry'"} }] }) }); console.log(r.status); if (r.status === 429) break; }`;
  const child = spawn(process.execPath, [join(repo, "src/cli.js"), "wrap", ...flags, "--receipts", receipts, "--kill-file", join(root, "KILL"), "--", process.execPath, "--input-type=module", "-e", childCode], {
    env: { ...process.env, COSTCAP_TEST_OPENAI_UPSTREAM: `http://127.0.0.1:${up.address().port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let err = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { err += chunk; });
  return new Promise((resolve) => {
    child.on("exit", (status) => {
      assert.equal(status, 0, err);
      const ledger = readFileSync(receipts, "utf8").trim().split("\n").map(JSON.parse);
      assert.equal(ledger.at(-1).blocked, true, name);
      resolve({
        scenario: name,
        upstreamCalls: hits,
        blockedReason: ledger.at(-1).reason,
        scope: ledger.at(-1).scope ?? null,
        statuses: output.trim().split("\n"),
        receiptCount: ledger.length,
        reportedCost: Number(ledger.reduce((n, row) => n + (typeof row.cost_usd === "number" ? row.cost_usd : 0), 0).toFixed(6)),
        unknownCostCount: ledger.filter((row) => row.cost_usd === null).length,
        receipts: ledger,
      });
    });
  });
}

try {
  const cap = await scenario("cap", ["--cap", "0.10"], 20);
  assert.equal(cap.upstreamCalls, 1);
  assert.equal(cap.blockedReason, "budget_exceeded");
  const spiral = await scenario("retry-spiral", [], 20, false);
  assert.equal(spiral.upstreamCalls, 5);
  assert.equal(spiral.blockedReason, "spiral_detected");
  const steps = await scenario("steps", ["--max-steps", "3"], 20);
  assert.equal(steps.upstreamCalls, 3);
  assert.equal(steps.blockedReason, "step_budget");
  const now = new Date();
  const dayReceipts = join(root, "day-cap.jsonl");
  writeFileSync(dayReceipts, JSON.stringify({ id: "seed-day", ts: now.toISOString(), cost_usd: 1, model: "gpt-4o-mini" }) + "\n");
  const day = await scenario("day-cap", ["--day-cap", "0.50"], 5);
  assert.equal(day.upstreamCalls, 0);
  assert.equal(day.scope, "day");
  const monthStamp = now.getUTCDate() === 1 ? now.toISOString() : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
  writeFileSync(join(root, "month-cap.jsonl"), JSON.stringify({ id: "seed-month", ts: monthStamp, cost_usd: 1, model: "gpt-4o-mini" }) + "\n");
  const month = await scenario("month-cap", ["--month-cap", "0.50", "--day-cap", "100"], 5);
  assert.equal(month.upstreamCalls, 0);
  assert.equal(month.scope, "month");
  writeFileSync(join(root, "unknown-cost.jsonl"), JSON.stringify({ id: "seed-unknown", ts: now.toISOString(), cost_usd: null, model: "gpt-4o-mini", reason: "usage_unavailable" }) + "\n");
  const unknown = await scenario("unknown-cost", ["--cap", "5"], 5);
  assert.equal(unknown.upstreamCalls, 0);
  assert.equal(unknown.blockedReason, "unreconciled_receipt");
  assert.ok(unknown.unknownCostCount >= 1);
  writeFileSync(join(root, "KILL"), "synthetic frozen");
  const killed = await scenario("kill-file", [], 20);
  assert.equal(killed.upstreamCalls, 0);
  assert.equal(killed.blockedReason, "killed");
  const results = [cap, spiral, steps, day, month, unknown, killed];
  const checkedAt = new Date().toISOString();
  const report = { checkedAt, command: "npm run acceptance:runaway", provider: "local fake OpenAI", paidCalls: 0, results };
  const outDir = join(repo, "docs/verification");
  mkdirSync(outDir, { recursive: true });
  const dayName = checkedAt.slice(0, 10);
  writeFileSync(join(outDir, `${dayName}-runaway.json`), JSON.stringify(report, null, 2) + "\n");
  const lines = results.map((row) => `| ${row.scenario} | ${row.upstreamCalls} | ${row.blockedReason} | ${row.scope ?? ""} | ${row.receiptCount} | ${row.unknownCostCount} |`);
  const markdown = `# Runaway acceptance ${dayName}

Command: \`npm run acceptance:runaway\`

The run uses the CLI wrapper, a local fake OpenAI server, and no credentials. Paid provider calls: 0. Unknown cost stays null. Receipts are in \`${dayName}-runaway.json\`.

| scenario | upstream calls | blocked reason | scope | receipts | unknown-cost receipts |
|---|---:|---|---|---:|---:|
${lines.join("\n")}

Checked at ${checkedAt}. Node ${process.version}.
`;
  writeFileSync(join(outDir, `${dayName}-runaway-acceptance.md`), markdown);
  console.log(JSON.stringify({ checkedAt, provider: report.provider, paidCalls: 0, results: results.map(({ receipts, ...rest }) => rest) }, null, 2));
} finally {
  up.closeAllConnections();
  up.close();
}
