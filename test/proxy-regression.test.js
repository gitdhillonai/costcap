import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractUsage, startMeteringProxy } from "../src/proxy.js";
import { createCapEngine } from "../src/cap.js";

async function fixture(t, handler, options = {}) {
  const up = http.createServer(handler);
  await new Promise((r) => up.listen(0, "127.0.0.1", r));
  const p = await startMeteringProxy({ upstreams: { openai: `http://127.0.0.1:${up.address().port}` }, ...options });
  t.after(() => { p.server.closeAllConnections(); p.server.close(); up.closeAllConnections(); up.close(); });
  return (n = 0) => fetch(`http://127.0.0.1:${p.port}/openai/v1/chat/completions?trace=yes`, { method: "POST", body: JSON.stringify({ model: "gpt-4o-mini", n }) });
}

test("Gemini counts cached, generated and reasoning tokens", () => {
  assert.deepEqual(extractUsage("gemini", JSON.stringify({ modelVersion: "gemini-test", usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 20, candidatesTokenCount: 30, thoughtsTokenCount: 10 } })), { model: "gemini-test", usage: { input_tokens: 80, cached_input_tokens: 20, output_tokens: 40 } });
});

test("Anthropic stream combines start input and delta output", () => {
  const text = ['data: {"message":{"model":"claude-test","usage":{"input_tokens":100,"output_tokens":0,"cache_read_input_tokens":20,"cache_creation_input_tokens":10}}}', 'data: {"usage":{"output_tokens":50}}'].join("\n");
  assert.deepEqual(extractUsage("anthropic", text), { model: "claude-test", usage: { input_tokens: 110, cached_input_tokens: 20, output_tokens: 50 } });
});

test("Responses API usage is parsed and missing usage is not free", () => {
  assert.deepEqual(extractUsage("openai", '{"usage":{"input_tokens":100,"output_tokens":20,"input_tokens_details":{"cached_tokens":10}}}', "model"), { model: "model", usage: { input_tokens: 90, output_tokens: 20, cached_input_tokens: 10 } });
  assert.equal(extractUsage("openai", '{}'), null);
  assert.equal(extractUsage("openai", '{"usage":{"prompt_tokens":-1}}'), null);
});

test("concurrent calls see previous cost, query survives, blocked receipt persists", async (t) => {
  let hits = 0;
  const file = join(mkdtempSync(join(tmpdir(), "cc-reg-")), "nested", "receipts.jsonl");
  const call = await fixture(t, (req, res) => {
    hits++; assert.match(req.url, /\?trace=yes$/);
    setTimeout(() => res.end('{"model":"gpt-4o-mini","usage":{"prompt_tokens":1000000,"completion_tokens":0}}'), 25);
  }, { cap: createCapEngine({ caps: { run: 0.10 } }), receiptsPath: file });
  const results = await Promise.all([call(1), call(2), call(3)]);
  assert.deepEqual(results.map((r) => r.status), [200, 429, 429]);
  assert.equal(hits, 1);
  const receipts = readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(receipts.length, 3);
  assert.equal(receipts[1].reason, "budget_exceeded");
  assert.equal(new Set(receipts.map((r) => r.id)).size, 3);
});

test("unknown usage latches accounting failure before a second upstream call", async (t) => {
  let hits = 0;
  const call = await fixture(t, (req, res) => { hits++; res.end('{}'); });
  assert.equal((await call(1)).status, 200);
  const blocked = await call(2);
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error, "accounting_unavailable");
  assert.equal(hits, 1);
});

test("timeout latches uncertain outcome, not zero spend", async (t) => {
  let hits = 0;
  const call = await fixture(t, () => { hits++; }, { timeoutMs: 30 });
  assert.equal((await call(1)).status, 502);
  assert.equal((await call(2)).status, 429);
  assert.equal(hits, 1);
});

test("oversized body is refused without provider call", async (t) => {
  let hits = 0;
  const call = await fixture(t, () => { hits++; }, { maxBodyBytes: 1 });
  assert.equal((await call()).status, 413);
  assert.equal(hits, 0);
});
