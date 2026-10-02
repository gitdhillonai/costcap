// NON-PRODUCTION SPIKE. Local only, no network beyond 127.0.0.1, no secrets.
// Substrate-neutral baseline: the smallest register -> policy -> kill loop,
// built from CostCap's own modules behind a tiny `Substrate` seam. Any
// candidate substrate (OpenClaw Enterprise, engrams) must be able to carry
// these three operations; swap it in by implementing the same 3 methods.

import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newEnrollmentToken, verifyToken, resolvePolicy } from "../../src/hosted/policy.js";
import { createCapEngine } from "../../src/cap.js";
import { createKillCheck, kill, resume } from "../../src/kill.js";
import { startMeteringProxy } from "../../src/proxy.js";

// --- the seam: what a substrate must provide ---------------------------
function localSubstrate(dir) {
  const agents = new Map();
  let policy = { version: 1, caps: {}, killed: false };
  const killFile = join(dir, "KILL");
  return {
    register(name) {                         // 1. register one agent
      const { token, hash } = newEnrollmentToken();
      agents.set(name, hash);
      return token;
    },
    authenticate(name, token) { return verifyToken(token, agents.get(name)); },
    setPolicy(next) { policy = { ...next, version: policy.version + 1 }; return policy; }, // 2. one policy
    getPolicy() { return policy; },
    kill(note) { kill(killFile, note); },    // 3. one kill
    resume() { resume(killFile); },
    killCheck: createKillCheck(killFile),
  };
}

const log = (...a) => console.log(...a);
const dir = mkdtempSync(join(tmpdir(), "costcap-spike-"));
const sub = localSubstrate(dir);

let upstreamCalls = 0;
const up = http.createServer((req, res) => {
  upstreamCalls++;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ model: "unknown-model", usage: { prompt_tokens: 100000, completion_tokens: 0 } }));
});
await new Promise((r) => up.listen(0, "127.0.0.1", r));

// 1. register
const token = sub.register("demo-agent");
log("1. register: token issued, auth ok =", sub.authenticate("demo-agent", token), "| wrong token ok =", sub.authenticate("demo-agent", token + "x"));

// 2. policy -> enforced caps (policy fetched; offline falls back to last-known)
const pol = sub.setPolicy({ caps: { run: 0.5 } });
const resolved = resolvePolicy({ fetched: pol });
log("2. policy: version", resolved.version, "caps", JSON.stringify(resolved.caps), "source", resolved.source);
const cap = createCapEngine({ caps: resolved.caps });
const { server, port } = await startMeteringProxy({ upstreams: { openai: `http://127.0.0.1:${up.address().port}` }, cap, killCheck: sub.killCheck });
const call = async (label) => {
  const r = await fetch(`http://127.0.0.1:${port}/openai/v1/x`, { method: "POST", body: JSON.stringify({ n: Math.random() }) });
  log(`   ${label}: HTTP ${r.status}`, r.status === 200 ? "" : JSON.stringify((await r.json()).error ?? ""));
};
await call("call 1 (spent $0.00 of $0.50)");
await call("call 2 (spent $0.25 of $0.50)");
await call("call 3 (spent $0.50, cap reached)");
log("   upstream calls so far:", upstreamCalls);

// 3. kill
const cap2 = createCapEngine({ caps: {} });
server.close();
const second = await startMeteringProxy({ upstreams: { openai: `http://127.0.0.1:${up.address().port}` }, cap: cap2, killCheck: sub.killCheck });
const call2 = async (label) => {
  const r = await fetch(`http://127.0.0.1:${second.port}/openai/v1/x`, { method: "POST", body: JSON.stringify({ n: Math.random() }) });
  log(`   ${label}: HTTP ${r.status}`);
};
sub.kill("spike");
const before = upstreamCalls;
await call2("3. kill: call while killed");
log("   upstream untouched while killed:", upstreamCalls === before);
sub.resume();
await call2("   call after resume");
second.server.close(); up.close();
log("DONE");
