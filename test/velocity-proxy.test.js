import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startMeteringProxy } from "../src/proxy.js";
import { createVelocityBreaker } from "../src/velocity.js";

// The cost-velocity circuit breaker (#8) is the headline runaway-spend
// protection. `velocity.test.js` proves the breaker in isolation and
// `cli.test.js` proves the *step_budget* sibling path through the proxy, but
// the proxy's cost-velocity enforcement was never exercised end-to-end: that
// the proxy feeds each call's real metered cost into the breaker and hard-stops
// the *next* upstream call once the spend rate spikes. A regression that fed
// the breaker the wrong cost, recorded it on the wrong edge, or dropped the
// pre-call check for the rate branch would keep every other test green while
// silently letting a cost runaway through.

// Mock upstream that bills exactly the prompt_tokens it is handed, so the test
// controls per-call cost precisely. gpt-4o-mini input is $0.15 / 1M tokens.
function billingUpstream() {
  return new Promise((resolve) => {
    let hits = 0;
    const server = http.createServer((req, res) => {
      hits++;
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let prompt_tokens = 0;
        try { prompt_tokens = JSON.parse(Buffer.concat(chunks)).prompt_tokens ?? 0; } catch { /* default 0 */ }
        res.writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ model: "gpt-4o-mini", usage: { prompt_tokens, completion_tokens: 0 } }));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, hits: () => hits }));
  });
}

test("proxy feeds metered cost into the velocity breaker and hard-stops a cost spike", async (t) => {
  const up = await billingUpstream();
  t.after(() => up.server.close());

  // Injected clock: the test advances it one bucket per call so the baseline
  // is built across distinct buckets, then holds it steady so the spike and
  // the follow-up check land in the same bucket.
  let clock = 0;
  const velocity = createVelocityBreaker({
    bucketMs: 1000, baselineBuckets: 5, multiple: 3, minSpendUsd: 0.5, now: () => clock,
  });
  const receipts = [];
  const { server, port } = await startMeteringProxy({
    upstreams: { openai: `http://127.0.0.1:${up.port}` }, velocity, onReceipt: (r) => receipts.push(r),
  });
  t.after(() => server.close());

  const call = (prompt_tokens) => fetch(`http://127.0.0.1:${port}/openai/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", prompt_tokens }),
  });

  // Five cheap baseline calls, one per bucket: 100k tokens => $0.015 each.
  for (let i = 1; i <= 5; i++) {
    clock = i * 1000;
    assert.equal((await call(100_000)).status, 200);
  }
  // Bucket 6: a spike call. The pre-call check still sees an empty current
  // bucket, so the spike itself is forwarded and billed ($1.50).
  clock = 6000;
  assert.equal((await call(10_000_000)).status, 200);

  // Same bucket, no clock advance: the breaker now sees $1.50 against a
  // ~$0.015 baseline (>3x and >= the $0.50 floor) and must latch open.
  const blocked = await call(100_000);
  assert.equal(blocked.status, 429);
  const body = await blocked.json();
  assert.equal(body.error, "breaker_open");
  assert.equal(body.reason, "cost_velocity");

  // The blocked call never reached the provider; only the 6 allowed calls did.
  assert.equal(up.hits(), 6);
  const last = receipts.at(-1);
  assert.equal(last.blocked, true);
  assert.equal(last.reason, "cost_velocity");
  assert.equal(last.cost_usd, 0);
});
