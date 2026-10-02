import test from "node:test";
import assert from "node:assert/strict";
import { createSpiralDetector, fingerprint } from "../src/spiral.js";

const body = (extra = {}) => JSON.stringify({ model: "m", messages: [{ role: "user", content: "fix  the bug" }], ...extra });

test("fingerprint ignores whitespace, key order and volatile keys", () => {
  const a = fingerprint("POST", "/v1/chat", body({ request_id: "1" }));
  const b = fingerprint("POST", "/v1/chat", JSON.stringify({ messages: [{ content: "fix the bug", role: "user" }], model: "m", request_id: "2" }));
  assert.equal(a, b);
});

test("different prompts do not match", () => {
  assert.notEqual(fingerprint("POST", "/p", body()), fingerprint("POST", "/p", body({ model: "n" })));
});

test("trips on the request after the threshold", () => {
  const d = createSpiralDetector({ threshold: 3 });
  for (let i = 0; i < 3; i++) assert.equal(d.observe("POST", "/p", body()), null);
  const hit = d.observe("POST", "/p", body());
  assert.equal(hit.count, 4);
});

test("old requests age out of the window", () => {
  let t = 0;
  const d = createSpiralDetector({ threshold: 2, windowMs: 1000, now: () => t });
  d.observe("POST", "/p", body()); d.observe("POST", "/p", body());
  t = 5000;
  assert.equal(d.observe("POST", "/p", body()), null);
});

test("distinct requests never trip", () => {
  const d = createSpiralDetector({ threshold: 2 });
  for (let i = 0; i < 20; i++) assert.equal(d.observe("POST", "/p", body({ n: i })), null);
});
