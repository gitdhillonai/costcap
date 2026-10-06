import test from "node:test";
import assert from "node:assert/strict";
import { lookupPrice, costForUsage, TABLE_VERSION } from "../src/pricing.js";

test("known model returns its table entry with version pinned", () => {
  const p = lookupPrice("gpt-4o-mini");
  assert.equal(p.input, 0.15);
  assert.equal(p.output, 0.6);
  assert.equal(p.fallback, false);
  assert.equal(p.table_version, TABLE_VERSION);
});

test("unknown model bills at declared fallback, flagged, never free", () => {
  const p = lookupPrice("gpt-99-ultra");
  assert.equal(p.fallback, true);
  assert.ok(p.input > 0 && p.output > 0);
  assert.equal(p.table_version, TABLE_VERSION);
});

test("cost arithmetic matches table rates", () => {
  const r = costForUsage("gpt-4o-mini", { input_tokens: 1_000_000, output_tokens: 500_000 });
  assert.equal(r.cost_usd, 0.45);
});

test("cached tokens bill at the cached rate", () => {
  const r = costForUsage("gpt-4o", { cached_input_tokens: 1_000_000 });
  assert.equal(r.cost_usd, 1.25);
});

test("zero usage costs zero but still pins the table version", () => {
  const r = costForUsage("unknown-model");
  assert.equal(r.cost_usd, 0);
  assert.equal(r.fallback, true);
  assert.equal(r.table_version, TABLE_VERSION);
});

test("dated snapshot ids price as their base model, not the fallback", () => {
  const p = lookupPrice("gpt-4o-mini-2024-07-18");
  assert.equal(p.fallback, false);
  assert.equal(p.input, 0.15);
  assert.equal(lookupPrice("gpt-99-ultra-2026-01-01").fallback, true);
});
