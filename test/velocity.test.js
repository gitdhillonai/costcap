import test from "node:test";
import assert from "node:assert/strict";
import { createVelocityBreaker } from "../src/velocity.js";

function setup(opts = {}) {
  let t = 0;
  const b = createVelocityBreaker({ bucketMs: 1000, baselineBuckets: 5, multiple: 3, minSpendUsd: 0.5, now: () => t, ...opts });
  return { b, tick: (n = 1) => { t += 1000 * n; } };
}

test("steady spend does not trip", () => {
  const { b, tick } = setup();
  for (let i = 0; i < 10; i++) { b.record(0.2); assert.equal(b.check(), null); tick(); }
});

test("a 10x spike after a baseline trips and latches", () => {
  const { b, tick } = setup();
  for (let i = 0; i < 5; i++) { b.record(0.2); tick(); }
  b.record(2);
  const hit = b.check();
  assert.equal(hit.reason, "cost_velocity");
  tick(10);
  assert.equal(b.check().reason, "cost_velocity"); // latched
  b.resume();
  assert.equal(b.check(), null);
});

test("no trip before a baseline exists", () => {
  const { b } = setup();
  b.record(5);
  assert.equal(b.check(), null);
});

test("small absolute spend never trips", () => {
  const { b, tick } = setup();
  for (let i = 0; i < 5; i++) { b.record(0.01); tick(); }
  b.record(0.3);
  assert.equal(b.check(), null);
});

test("step budget trips at max steps", () => {
  const { b } = setup({ maxSteps: 3 });
  for (let i = 0; i < 3; i++) { assert.equal(b.check(), null); b.record(0); }
  assert.equal(b.check().reason, "step_budget");
});
