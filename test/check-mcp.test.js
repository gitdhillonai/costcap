import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkBudget } from "../src/check.js";
import { handleMcp } from "../src/mcp.js";
function ledger(costs) {
  const path = join(mkdtempSync(join(tmpdir(), "cc-check-")), "r.jsonl");
  writeFileSync(path, costs.map((cost_usd) => JSON.stringify({ ts: "2026-10-04T12:00:00Z", cost_usd })).join("\n"));
  return path;
}
test("CI budget checks fail closed for unknown, malformed or missing evidence", () => {
  assert.equal(checkBudget({ receiptsPath: ledger([0.1]), caps: { run: 1 } }).ok, true);
  assert.equal(checkBudget({ receiptsPath: ledger([0.1]), caps: { run: 0.1 } }).ok, false);
  assert.equal(checkBudget({ receiptsPath: ledger([null]), caps: { run: 1 } }).ok, false);
  assert.throws(() => checkBudget({ receiptsPath: ledger([]) }), /No receipts/);
  assert.throws(() => checkBudget({ receiptsPath: ledger([-1]) }), /Invalid/);
});
test("check command exits 0 under, 1 at cap, 2 for absent evidence", () => {
  const path = ledger([0.1]);
  const run = (cap) => spawnSync(process.execPath, ["src/cli.js", "check", "--receipts", path, "--cap", cap]);
  assert.equal(run("1").status, 0);
  assert.equal(run("0.1").status, 1);
  assert.equal(run("bad").status, 2);
});
test("MCP supports initialize, tool listing and read-only budget status", () => {
  const options = { receiptsPath: ledger([0.1]), caps: { run: 1 } };
  const call = (method, params) => handleMcp({ jsonrpc: "2.0", id: 1, method, params }, options);
  assert.equal(call("initialize").result.serverInfo.name, "costcap");
  assert.equal(call("tools/list").result.tools[0].name, "budget_status");
  assert.equal(JSON.parse(call("tools/call", { name: "budget_status" }).result.content[0].text).ok, true);
  assert.equal(call("tools/call", { name: "kill" }).error.code, -32601);
  assert.equal(handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, options), null);
});
test("MCP stdio handles malformed lines without crashing", () => {
  const path = ledger([0.1]);
  const result = spawnSync(process.execPath, ["src/cli.js", "mcp", "--receipts", path, "--cap", "1"], { input: 'bad\n{"jsonrpc":"2.0","id":1,"method":"ping"}\n', encoding: "utf8" });
  assert.equal(result.status, 0);
  const replies = result.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(replies[0].error.code, -32700);
  assert.deepEqual(replies[1].result, {});
});
