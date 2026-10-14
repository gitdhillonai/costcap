import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lookupPrice, costForUsage, TABLE_VERSION } from "../src/pricing.js";

const table = JSON.parse(readFileSync(new URL("../src/pricing-table.json", import.meta.url), "utf8"));

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

test("Claude and Gemini models the proxy routes use table rates, not the fallback", () => {
  for (const model of ["claude-sonnet-4-6", "gemini-2.5-flash", "anthropic/claude-sonnet-4.6"]) {
    const p = lookupPrice(model);
    assert.equal(p.fallback, false, model);
    assert.equal(p.table_version, "2026-10-14");
    assert.notEqual(p.output, table.fallback.output);
  }
  assert.equal(lookupPrice("claude-sonnet-4-6").output, 15);
  assert.equal(lookupPrice("gemini-2.5-flash").input, 0.3);
});

test("every table rate is finite and positive and each provider has a source URL", () => {
  assert.equal(table.version, TABLE_VERSION);
  for (const host of ["openai.com", "claude.com", "google.dev", "openrouter.ai"]) {
    assert.ok(table.sources.some((url) => url.includes(host)), host);
  }
  for (const [model, rates] of Object.entries(table.models)) {
    for (const field of ["input", "cached_input", "output"]) {
      assert.equal(Number.isFinite(rates[field]) && rates[field] > 0, true, `${model}.${field}`);
    }
  }
});

test("dated snapshot ids price as their base model, not the fallback", () => {
  const p = lookupPrice("gpt-4o-mini-2024-07-18");
  assert.equal(p.fallback, false);
  assert.equal(p.input, 0.15);
  assert.equal(lookupPrice("gpt-99-ultra-2026-01-01").fallback, true);
});
