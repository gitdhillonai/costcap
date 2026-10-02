import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseWrapArgs } from "../src/cli.js";

test("parseWrapArgs reads --cap and the command after --", () => {
  const o = parseWrapArgs(["--cap", "5.00", "--", "node", "-e", "1"]);
  assert.equal(o.caps.run, 5);
  assert.deepEqual(o.command, ["node", "-e", "1"]);
});

test("parseWrapArgs rejects bad caps, unknown flags, and a missing command", () => {
  assert.throws(() => parseWrapArgs(["--cap", "abc", "--", "x"]), /positive number/);
  assert.throws(() => parseWrapArgs(["--cap", "-1", "--", "x"]), /positive number/);
  assert.throws(() => parseWrapArgs(["--bogus", "1", "--", "x"]), /unknown flag/);
  assert.throws(() => parseWrapArgs(["--cap", "1"]), /usage/);
});

test("wrap points the child at the proxy and the cap hard-stops the second call", async (t) => {
  const up = await new Promise((r) => {
    const s = http.createServer((q, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ model: "gpt-4o-mini", usage: { prompt_tokens: 1_000_000, completion_tokens: 500_000 } })));
    s.listen(0, "127.0.0.1", () => r({ s, port: s.address().port }));
  });
  t.after(() => up.s.close());
  const dir = mkdtempSync(path.join(tmpdir(), "cc-"));
  // The child calls the proxy twice; the first call costs $0.45 which exceeds the $0.10 cap.
  const script = `
    const u = process.env.OPENAI_BASE_URL + "/chat/completions";
    const a = await fetch(u,{method:"POST",body:JSON.stringify({n:1})});
    const b = await fetch(u,{method:"POST",body:JSON.stringify({n:2})});
    console.log(a.status, b.status);`;
  // Upstream is real OpenAI by default, so run the proxy against the mock by pre-setting nothing: use env override below.
  const res = await new Promise((resolve) => {
    const c = spawn(process.execPath, ["src/cli.js", "wrap", "--cap", "0.10", "--receipts", path.join(dir, "r.jsonl"), "--", process.execPath, "--input-type=module", "-e", script],
      { env: { ...process.env, COSTCAP_TEST_OPENAI_UPSTREAM: `http://127.0.0.1:${up.port}` } });
    let out = ""; c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", () => {});
    c.on("exit", (code) => resolve({ code, out }));
  });
  assert.equal(res.code, 0);
  assert.equal(res.out.trim(), "200 429");
});

test("parseWrapArgs reads --max-steps and --velocity-multiple and validates them", () => {
  const o = parseWrapArgs(["--max-steps", "40", "--velocity-multiple", "4", "--", "x"]);
  assert.equal(o.maxSteps, 40);
  assert.equal(o.velocityMultiple, 4);
  assert.throws(() => parseWrapArgs(["--max-steps", "0", "--", "x"]), /positive integer/);
  assert.throws(() => parseWrapArgs(["--max-steps", "1.5", "--", "x"]), /positive integer/);
  assert.throws(() => parseWrapArgs(["--velocity-multiple", "1", "--", "x"]), /greater than 1/);
});

test("wrap --max-steps 2 lets two calls through and breaks the third with breaker_open", async (t) => {
  const up = await new Promise((r) => {
    const s = http.createServer((q, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ model: "gpt-4o-mini", usage: { prompt_tokens: 10, completion_tokens: 5 } })));
    s.listen(0, "127.0.0.1", () => r({ s, port: s.address().port }));
  });
  t.after(() => up.s.close());
  const dir = mkdtempSync(path.join(tmpdir(), "cc-"));
  const script = `
    const u = process.env.OPENAI_BASE_URL + "/chat/completions";
    const out = [];
    for (let n = 0; n < 3; n++) { const r = await fetch(u,{method:"POST",body:JSON.stringify({n})}); out.push(r.status); if (r.status===429) out.push((await r.json()).error); }
    console.log(out.join(" "));`;
  const res = await new Promise((resolve) => {
    const c = spawn(process.execPath, ["src/cli.js", "wrap", "--max-steps", "2", "--receipts", path.join(dir, "r.jsonl"), "--", process.execPath, "--input-type=module", "-e", script],
      { env: { ...process.env, COSTCAP_TEST_OPENAI_UPSTREAM: `http://127.0.0.1:${up.port}` } });
    let out = ""; c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", () => {});
    c.on("exit", (code) => resolve({ code, out }));
  });
  assert.equal(res.code, 0);
  assert.equal(res.out.trim(), "200 200 429 breaker_open");
});
