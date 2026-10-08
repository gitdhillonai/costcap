import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { reconcile } from "../src/reconcile.js";

test("reconciliation does not treat unknown or missing provider cost as zero", () => {
  const same = reconcile({ receipts: [{ id: "a", cost_usd: 1.25 }], charges: [{ id: "a", cost_usd: 1.25 }] });
  assert.equal(same.ok, true);
  assert.equal(same.matched, 1);
  const unknown = reconcile({ receipts: [{ id: "a", cost_usd: null }, { id: "b", cost_usd: 1 }], charges: [{ id: "a", cost_usd: 0 }, { id: "b", cost_usd: 1 }] });
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown.unknown, ["a"]);
  assert.equal(unknown.mismatched.includes("a"), false);
  const gap = reconcile({ receipts: [{ id: "a", cost_usd: 1 }], charges: [{ id: "b", cost_usd: 1 }] });
  assert.deepEqual(gap.receipt_only, ["a"]);
  assert.deepEqual(gap.provider_only, ["b"]);
  const drift = reconcile({ receipts: [{ id: "a", cost_usd: 1 }], charges: [{ id: "a", cost_usd: 1.5 }] });
  assert.deepEqual(drift.mismatched, ["a"]);
  assert.throws(() => reconcile({ receipts: [], charges: [] }), /No receipts/);
});

test("a duplicate or empty receipt id fails loudly, like a duplicate provider charge", () => {
  // A repeated receipt id means ledger corruption; it must never be silently
  // split across matched and receipt_only. Symmetric with the charge-side guard.
  assert.throws(
    () => reconcile({ receipts: [{ id: "a", cost_usd: 1 }, { id: "a", cost_usd: 1 }], charges: [{ id: "a", cost_usd: 1 }] }),
    /Duplicate receipt id/,
  );
  assert.throws(() => reconcile({ receipts: [{ id: "", cost_usd: 1 }], charges: [] }), /Receipt needs an id/);
  assert.throws(() => reconcile({ receipts: [{ id: "a", cost_usd: 1 }, { id: "a", cost_usd: null }], charges: [{ id: "a", cost_usd: 1 }] }), /Duplicate receipt id/);
});

test("reconcile command exits 0 on a match, 1 on a gap, and 2 without files", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-recon-"));
  const receipts = join(dir, "receipts.jsonl");
  const provider = join(dir, "provider.jsonl");
  writeFileSync(receipts, JSON.stringify({ id: "a", ts: "2026-10-06T00:00:00Z", cost_usd: 0.2 }) + "\n");
  writeFileSync(provider, JSON.stringify({ id: "a", cost_usd: 0.2 }) + "\n");
  const cli = new URL("../src/cli.js", import.meta.url).pathname;
  const ok = spawnSync(process.execPath, [cli, "reconcile", "--receipts", receipts, "--provider", provider], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).ok, true);
  writeFileSync(provider, JSON.stringify({ id: "a", cost_usd: null }) + "\n");
  const bad = spawnSync(process.execPath, [cli, "reconcile", "--receipts", receipts, "--provider", provider], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
  const missing = spawnSync(process.execPath, [cli, "reconcile"], { encoding: "utf8" });
  assert.equal(missing.status, 2);
});
