import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createCapEngine } from "../src/cap.js";
import { startMeteringProxy } from "../src/proxy.js";

test("engine: run cap trips at the cap", () => {
  const cap = createCapEngine({ caps: { run: 1 } });
  assert.equal(cap.check(), null);
  cap.record({ cost_usd: 1 });
  assert.equal(cap.check().scope, "run");
});

test("engine: day and month caps use history", () => {
  const now = () => new Date("2026-10-02T12:00:00Z");
  const history = [
    { ts: "2026-10-02T01:00:00Z", cost_usd: 2 },
    { ts: "2026-10-01T01:00:00Z", cost_usd: 3 },
    { ts: "2026-09-30T01:00:00Z", cost_usd: 50 },
  ];
  assert.equal(createCapEngine({ caps: { day: 2 }, history, now }).check().scope, "day");
  assert.equal(createCapEngine({ caps: { day: 3, month: 5 }, history, now }).check().scope, "month");
  assert.equal(createCapEngine({ caps: { day: 3, month: 6 }, history, now }).check(), null);
});

test("proxy: hard stop never calls upstream once the cap is hit", async () => {
  let upstreamCalls = 0;
  const up = http.createServer((req, res) => {
    upstreamCalls++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: "unknown-model", usage: { prompt_tokens: 1000000, completion_tokens: 0 } }));
  });
  await new Promise((r) => up.listen(0, "127.0.0.1", r));
  const upstreams = { openai: `http://127.0.0.1:${up.address().port}` };
  const cap = createCapEngine({ caps: { run: 0.01 } });
  const { server, port } = await startMeteringProxy({ upstreams, cap });
  const call = () => fetch(`http://127.0.0.1:${port}/openai/v1/chat/completions`, { method: "POST", body: "{}" });
  const first = await call();
  assert.equal(first.status, 200);
  const second = await call();
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error.type, "budget_exceeded");
  assert.equal(upstreamCalls, 1);
  server.close(); up.close();
});
