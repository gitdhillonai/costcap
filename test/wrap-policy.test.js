import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

test("wrapper cannot loosen a cached fleet policy", async () => {
  let hits = 0;
  let servedPolicy = { version: 1, caps: { run: 100 }, killed: false };
  const up = http.createServer((req, res) => {
    hits++;
    res.end(JSON.stringify({ model: "gpt-4o-mini", usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } }));
  });
  const fleet = http.createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => { text += chunk; });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/policy") res.end(JSON.stringify(servedPolicy));
      else if (req.url === "/v1/receipts") res.end(JSON.stringify({ acceptedIds: JSON.parse(text).receipts.map((r) => r.id) }));
      else { res.statusCode = 404; res.end("{}"); }
    });
  });
  const upPort = await listen(up);
  const fleetPort = await listen(fleet);
  const dir = mkdtempSync(join(tmpdir(), "cc-policy-"));
  const enrollment = join(dir, "enrollment.json");
  const receipts = join(dir, "r.jsonl");
  writeFileSync(enrollment, JSON.stringify({
    url: `http://127.0.0.1:${fleetPort}`,
    token: "agent-token",
    agentId: "agent-1",
    policy: { version: 1, caps: { run: 0.10 }, killed: false },
    syncedIds: [],
  }), { mode: 0o600 });
  const script = `for (let i = 0; i < 3; i++) { const r = await fetch(process.env.OPENAI_BASE_URL + "/chat/completions", { method: "POST", body: JSON.stringify({ n: i }) }); console.log(r.status); if (r.status === 429) break; }`;
  const run = (args) => new Promise((resolve) => {
    const child = spawn(process.execPath, ["src/cli.js", "wrap", ...args, "--enrollment", enrollment, "--receipts", receipts, "--kill-file", join(dir, "KILL"), "--", process.execPath, "--input-type=module", "-e", script], { env: { ...process.env, COSTCAP_TEST_OPENAI_UPSTREAM: `http://127.0.0.1:${upPort}` } });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("exit", (code) => resolve({ code, out, err }));
  });
  const loose = await run(["--cap", "50"]);
  assert.equal(loose.code, 0, loose.err);
  assert.equal(loose.out.trim(), "200\n429");
  assert.equal(hits, 1);
  const cached = JSON.parse(readFileSync(enrollment, "utf8"));
  assert.equal(cached.policy.caps.run, 0.10);
  servedPolicy = { version: 2, caps: { run: 10 }, killed: false };
  writeFileSync(enrollment, JSON.stringify({ ...cached, policy: { version: 1, caps: { run: 10 }, killed: false }, syncedIds: [] }));
  hits = 0;
  const tightened = await run(["--cap", "0.05"]);
  assert.equal(tightened.code, 0, tightened.err);
  assert.equal(tightened.out.trim(), "200\n429");
  assert.equal(hits, 1);
  const updated = JSON.parse(readFileSync(enrollment, "utf8"));
  assert.equal(updated.policy.version, 2);
  assert.equal(updated.policy.caps.run, 10);
  up.close();
  fleet.close();
});
