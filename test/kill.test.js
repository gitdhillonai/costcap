import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createKillCheck, kill, resume } from "../src/kill.js";
import { startMeteringProxy } from "../src/proxy.js";

test("kill writes the file, check sees it, resume clears it", () => {
  const f = join(mkdtempSync(join(tmpdir(), "cc-")), "sub", "KILL");
  const check = createKillCheck(f);
  assert.equal(check(), null);
  kill(f, "runaway");
  assert.equal(check().reason, "killed");
  assert.equal(check().note, "runaway");
  assert.equal(resume(f), true);
  assert.equal(check(), null);
  assert.equal(resume(f), false);
});

test("hand-touched kill file also kills", () => {
  const f = join(mkdtempSync(join(tmpdir(), "cc-")), "KILL");
  writeFileSync(f, "");
  assert.equal(createKillCheck(f)().reason, "killed");
});

test("proxy refuses while killed and recovers after resume, upstream untouched", async () => {
  let calls = 0;
  const up = http.createServer((req, res) => { calls++; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ model: "m", usage: { prompt_tokens: 1, completion_tokens: 1 } })); });
  await new Promise((r) => up.listen(0, "127.0.0.1", r));
  const f = join(mkdtempSync(join(tmpdir(), "cc-")), "KILL");
  const { server, port } = await startMeteringProxy({ upstreams: { openai: `http://127.0.0.1:${up.address().port}` }, killCheck: createKillCheck(f) });
  const call = () => fetch(`http://127.0.0.1:${port}/openai/v1/x`, { method: "POST", body: JSON.stringify({ n: Math.random() }) });
  assert.equal((await call()).status, 200);
  kill(f);
  const r = await call();
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, "killed");
  assert.equal(calls, 1);
  resume(f);
  assert.equal((await call()).status, 200);
  server.close(); up.close();
});

test("cli kill and resume subcommands", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-"));
  const f = join(dir, "KILL");
  const cli = new URL("../src/cli.js", import.meta.url).pathname;
  const k = spawnSync("node", [cli, "kill", "--kill-file", f]);
  assert.equal(k.status, 0);
  assert.ok(existsSync(f));
  spawnSync("node", [cli, "resume", "--kill-file", f]);
  assert.ok(!existsSync(f));
});
