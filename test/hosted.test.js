import test from "node:test";
import assert from "node:assert/strict";
import { newEnrollmentToken, verifyToken, validatePolicy, resolvePolicy } from "../src/hosted/policy.js";
import { evaluateAlerts, dedupeAlerts, auditEntry } from "../src/hosted/alerts.js";

test("enrollment token verifies against its hash only", () => {
  const { token, hash } = newEnrollmentToken();
  assert.ok(verifyToken(token, hash));
  assert.ok(!verifyToken(token + "x", hash));
  assert.ok(!verifyToken(token, undefined));
  assert.ok(!hash.includes(token));
});

test("policy validation", () => {
  assert.deepEqual(validatePolicy({ version: 1, caps: { day: 5 } }), []);
  assert.ok(validatePolicy({ version: 0 }).length);
  assert.ok(validatePolicy({ version: 1, caps: { run: -1 } }).length);
});

test("offline keeps last-known policy", () => {
  const lastKnown = { version: 3, caps: { day: 5 }, killed: true };
  const r = resolvePolicy({ lastKnown, fetched: null });
  assert.equal(r.source, "last-known");
  assert.equal(r.caps.day, 5);
  assert.equal(r.killed, true);
});

test("older or invalid fetched policy never replaces last-known", () => {
  const lastKnown = { version: 3, caps: { day: 5 } };
  assert.equal(resolvePolicy({ lastKnown, fetched: { version: 2, caps: { day: 500 } } }).caps.day, 5);
  assert.equal(resolvePolicy({ lastKnown, fetched: { version: 9, caps: { day: -1 } } }).caps.day, 5);
  assert.equal(resolvePolicy({ lastKnown, fetched: { version: 4, caps: { day: 8 } } }).caps.day, 8);
});

test("local flags can tighten but not loosen a fleet policy", () => {
  const lastKnown = { version: 1, caps: { day: 5, run: 2 } };
  const r = resolvePolicy({ lastKnown, local: { day: 10, run: 1, month: 40 } });
  assert.deepEqual(r.caps, { run: 1, day: 5, month: 40 });
});

test("alerts: approaching, hit, loop, silent", () => {
  const base = { agentId: "a1", caps: { day: 10 }, nowMs: 100_000_000, lastSeenMs: 99_000_000 };
  assert.deepEqual(evaluateAlerts({ ...base, spend: { day: 7 } }), []);
  assert.equal(evaluateAlerts({ ...base, spend: { day: 8 } })[0].kind, "cap_approaching");
  assert.equal(evaluateAlerts({ ...base, spend: { day: 10 } })[0].kind, "cap_hit");
  assert.equal(evaluateAlerts({ ...base, spend: {}, blockedReasons: ["spiral_detected"] })[0].kind, "loop_detected");
  assert.equal(evaluateAlerts({ ...base, spend: {}, lastSeenMs: 0 })[0].kind, "agent_silent");
});

test("a velocity-breaker trip pages the operator, an ordinary cap block does not", () => {
  // Both guardrail trip reasons (#7 spiral, #8 velocity) must raise loop_detected;
  // a plain budget block must not, or every capped run would page as a loop.
  const base = { agentId: "a1", caps: { day: 10 }, spend: {}, nowMs: 100_000_000, lastSeenMs: 99_000_000 };
  assert.deepEqual(evaluateAlerts({ ...base, blockedReasons: ["cost_velocity"] }).map((a) => a.kind), ["loop_detected"]);
  assert.deepEqual(evaluateAlerts({ ...base, blockedReasons: ["budget_exceeded", "killed"] }), []);
});

test("dedupe fires once, re-arms after clearing", () => {
  const a = [{ kind: "cap_hit", key: "k" }];
  let r = dedupeAlerts(a, new Set());
  assert.equal(r.fire.length, 1);
  r = dedupeAlerts(a, r.active);
  assert.equal(r.fire.length, 0);
  r = dedupeAlerts([], r.active);
  r = dedupeAlerts(a, r.active);
  assert.equal(r.fire.length, 1);
});

test("audit entry needs who/what", () => {
  assert.throws(() => auditEntry({ orgId: "o" }));
  assert.equal(auditEntry({ orgId: "o", actor: "u", action: "cap.raise", target: "a1" }).action, "cap.raise");
});

test("same-version policy cannot silently loosen caps or resume killed agent", () => {
  const lastKnown = { version: 4, caps: { run: 1 }, killed: true };
  const fetched = { version: 4, caps: { run: 100 }, killed: false };
  const r = resolvePolicy({ lastKnown, fetched });
  assert.equal(r.caps.run, 1);
  assert.equal(r.killed, true);
});

test("corrupt cached policies and invalid local caps fail closed", () => {
  assert.throws(() => resolvePolicy({ lastKnown: { version: 1, caps: { day: -1 } } }), /Invalid cached/);
  assert.throws(() => resolvePolicy({ local: { run: -1 } }), /Invalid local/);
});
