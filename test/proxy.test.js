import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { startMeteringProxy, baseUrlOverrides } from "../src/proxy.js";
import { TABLE_VERSION } from "../src/pricing.js";

// Mock upstream provider: returns a fixed chat completion with usage.
function mockUpstream(body, contentType = "application/json") {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": contentType }).end(body);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const COMPLETION = JSON.stringify({
  model: "gpt-4o-mini",
  usage: { prompt_tokens: 1_000_000, completion_tokens: 500_000, prompt_tokens_details: { cached_tokens: 0 } },
});

const STREAM = [
  'data: {"model":"gpt-4o-mini","choices":[{"delta":{"content":"hi"}}]}',
  'data: {"model":"gpt-4o-mini","usage":{"prompt_tokens":2000,"completion_tokens":1000,"prompt_tokens_details":{"cached_tokens":1000}}}',
  "data: [DONE]",
  "",
].join("\n");

test("meters a non-streaming call and writes a versioned receipt", async (t) => {
  const up = await mockUpstream(COMPLETION);
  t.after(() => up.server.close());
  const receipts = [];
  const { server, port } = await startMeteringProxy(
    { upstreams: { openai: `http://127.0.0.1:${up.port}` }, onReceipt: (r) => receipts.push(r) });
  t.after(() => server.close());

  const res = await fetch(`http://127.0.0.1:${port}/openai/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert.equal(res.status, 200);
  await new Promise((r) => setImmediate(r));
  assert.equal(receipts.length, 1);
  const r = receipts[0];
  assert.equal(r.model, "gpt-4o-mini");
  assert.equal(r.cost_usd, 0.45); // 1M input @0.15 + 0.5M output @0.60
  assert.equal(r.table_version, TABLE_VERSION);
  assert.equal(r.fallback, false);
});

test("streaming responses are metered from the usage chunk", async (t) => {
  const up = await mockUpstream(STREAM, "text/event-stream");
  t.after(() => up.server.close());
  const receipts = [];
  const { server, port } = await startMeteringProxy(
    { upstreams: { openai: `http://127.0.0.1:${up.port}` }, onReceipt: (r) => receipts.push(r) });
  t.after(() => server.close());

  const res = await fetch(`http://127.0.0.1:${port}/openai/v1/chat/completions`, { method: "POST", body: "{}" });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /\[DONE\]/); // stream passed through intact
  await new Promise((r) => setImmediate(r));
  assert.equal(receipts.length, 1);
  // 1000 uncached @0.15 + 1000 cached @0.075 + 1000 output @0.60 per 1M
  assert.equal(receipts[0].cost_usd, 0.000825);
});

test("unknown provider path 404s and writes no receipt", async (t) => {
  const { server, port } = await startMeteringProxy({ upstreams: {} });
  t.after(() => server.close());
  const res = await fetch(`http://127.0.0.1:${port}/openai/v1/chat/completions`, { method: "POST", body: "{}" });
  assert.equal(res.status, 404);
});

test("baseUrlOverrides emits env rewrites for the big four", () => {
  const lines = baseUrlOverrides(8080);
  assert.ok(lines.some((l) => l === "OPENAI_BASE_URL=http://127.0.0.1:8080/openai/v1"));
  assert.ok(lines.some((l) => l.startsWith("ANTHROPIC_BASE_URL=")));
  assert.ok(lines.some((l) => l.startsWith("OPENROUTER_BASE_URL=")));
  assert.ok(lines.some((l) => l.startsWith("GEMINI_BASE_URL=")));
});

test("anthropic usage shape meters input/output/cache_read", async (t) => {
  const anthropicBody = JSON.stringify({
    model: "claude-unknown-future",
    usage: { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0 },
  });
  const up = await mockUpstream(anthropicBody);
  t.after(() => up.server.close());
  const receipts = [];
  const { server, port } = await startMeteringProxy(
    { upstreams: { anthropic: `http://127.0.0.1:${up.port}` }, onReceipt: (r) => receipts.push(r) });
  t.after(() => server.close());
  await fetch(`http://127.0.0.1:${port}/anthropic/v1/messages`, { method: "POST", body: "{}" });
  await new Promise((r) => setImmediate(r));
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].fallback, true); // unknown model -> declared fallback rate
  assert.equal(receipts[0].cost_usd, 2.5);
});
