import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractUsage, startMeteringProxy, baseUrlOverrides } from "../src/proxy.js";
import { createCapEngine } from "../src/cap.js";

// OpenRouter is OpenAI-compatible, so its usage lands in the default branch.
// It is a wired, env-exposed provider; these tests keep its routing and
// metering honest so a provider-table or path-parsing regression goes red.

test("OpenRouter usage parses like OpenAI, including cached tokens and slashed model ids", () => {
  assert.deepEqual(
    extractUsage(
      "openrouter",
      '{"model":"anthropic/claude-3.5-sonnet","usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":10}}}',
    ),
    { model: "anthropic/claude-3.5-sonnet", usage: { input_tokens: 90, output_tokens: 20, cached_input_tokens: 10 } },
  );
});

test("baseUrlOverrides points OPENROUTER_BASE_URL at the proxy's openrouter path", () => {
  const line = baseUrlOverrides(8080, ["openrouter"]).find((l) => l.startsWith("OPENROUTER_BASE_URL="));
  assert.equal(line, "OPENROUTER_BASE_URL=http://127.0.0.1:8080/openrouter");
});

test("a request routed through /openrouter meters an unknown model at the fallback rate and the cap hard-stops the next call", async (t) => {
  let hits = 0;
  const up = http.createServer((req, res) => {
    hits++;
    assert.equal(req.url, "/api/v1/chat/completions");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: "mistralai/mistral-large", usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } }));
  });
  await new Promise((r) => up.listen(0, "127.0.0.1", r));
  const file = join(mkdtempSync(join(tmpdir(), "cc-or-")), "receipts.jsonl");
  const { server, port } = await startMeteringProxy({
    upstreams: { openrouter: `http://127.0.0.1:${up.address().port}` },
    cap: createCapEngine({ caps: { run: 1 } }),
    receiptsPath: file,
  });
  t.after(() => { server.closeAllConnections(); server.close(); up.closeAllConnections(); up.close(); });

  const call = (n) => fetch(`http://127.0.0.1:${port}/openrouter/api/v1/chat/completions`, { method: "POST", body: JSON.stringify({ model: "mistralai/mistral-large", n }) });
  // First call: 1M input tokens at the $2.50/1M fallback input rate = $2.50 > $1 cap, so the next call is blocked.
  assert.equal((await call(1)).status, 200);
  assert.equal((await call(2)).status, 429);
  assert.equal(hits, 1, "the blocked call must not reach the upstream");

  const receipts = readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].provider, "openrouter");
  assert.equal(receipts[0].path, "/api/v1/chat/completions");
  assert.equal(receipts[0].cost_usd, 2.5);
  assert.equal(receipts[0].fallback, true);
  assert.equal(receipts[1].blocked, true);
  assert.equal(receipts[1].reason, "budget_exceeded");
});
