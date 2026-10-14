import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCapEngine } from "../src/cap.js";
import { extractUsage, startMeteringProxy } from "../src/proxy.js";
import { costForUsage, TABLE_VERSION } from "../src/pricing.js";
import { lockLedger } from "../src/ledger-lock.js";
import { DEFAULT_KILL_FILE, kill } from "../src/kill.js";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

test("a metered call can exceed the remaining run cap and the next call does not", async () => {
  let hits = 0;
  const up = http.createServer((req, res) => {
    hits++;
    res.end(JSON.stringify({ model: "gpt-4o-mini", usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } }));
  });
  const port = await listen(up);
  const dir = mkdtempSync(join(tmpdir(), "cc-over-"));
  const receipts = join(dir, "r.jsonl");
  const { server } = await startMeteringProxy({ receiptsPath: receipts, upstreams: { openai: `http://127.0.0.1:${port}` }, cap: createCapEngine({ caps: { run: 0.10 } }) });
  const call = () => fetch(`http://127.0.0.1:${server.address().port}/openai/v1/chat/completions`, { method: "POST", body: "{}" });
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 429);
  const ledger = readFileSync(receipts, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(hits, 1);
  assert.ok(ledger[0].cost_usd > 0.10);
  assert.equal(ledger[0].table_version, TABLE_VERSION);
  assert.equal(ledger[1].blocked, true);
  server.close();
  up.close();
});

test("proxy serializes upstream calls", async () => {
  let active = 0;
  let max = 0;
  const up = http.createServer((req, res) => {
    active++;
    max = Math.max(max, active);
    setTimeout(() => { active--; res.end('{"model":"gpt-4o-mini","usage":{"prompt_tokens":1,"completion_tokens":0}}'); }, 40);
  });
  const port = await listen(up);
  const { server } = await startMeteringProxy({ upstreams: { openai: `http://127.0.0.1:${port}` }, cap: createCapEngine({}) });
  const call = () => fetch(`http://127.0.0.1:${server.address().port}/openai/v1/chat/completions`, { method: "POST", body: '{"n":1}' });
  await Promise.all([call(), call(), call()]);
  assert.equal(max, 1);
  server.close();
  up.close();
});

test("separate ledgers do not share day or month caps", () => {
  const now = () => new Date("2026-10-06T12:00:00Z");
  const history = [{ ts: "2026-10-06T01:00:00Z", cost_usd: 5 }];
  assert.equal(createCapEngine({ caps: { day: 1, month: 1 }, history, now }).check().scope, "day");
  assert.equal(createCapEngine({ caps: { day: 1, month: 1 }, history: [], now }).check(), null);
});

test("a lock left by a stopped wrapper is kept until it is removed", () => {
  const path = join(mkdtempSync(join(tmpdir(), "cc-lock-")), "receipts.jsonl");
  const release = lockLedger(path);
  assert.ok(existsSync(`${path}.lock`));
  assert.throws(() => lockLedger(path), /Confirm the owner stopped/);
  assert.ok(existsSync(`${path}.lock`));
  release();
  assert.equal(existsSync(`${path}.lock`), false);
});

test("day and month windows use UTC dates", () => {
  const now = () => new Date("2026-10-02T03:00:00Z");
  const previousUtcDay = [{ ts: "2026-10-01T23:30:00Z", cost_usd: 9 }];
  const sameUtcDay = [{ ts: "2026-10-02T00:30:00Z", cost_usd: 9 }];
  assert.equal(createCapEngine({ caps: { day: 1 }, history: previousUtcDay, now }).check(), null);
  assert.equal(createCapEngine({ caps: { day: 1 }, history: sameUtcDay, now }).check().scope, "day");
  assert.equal(createCapEngine({ caps: { month: 1 }, history: [{ ts: "2026-09-30T23:00:00Z", cost_usd: 9 }], now }).check(), null);
  assert.equal(createCapEngine({ caps: { month: 1 }, history: [{ ts: "2026-10-01T00:30:00Z", cost_usd: 9 }], now }).check().scope, "month");
});

test("missing usage is stored as null and blocks the next call", async () => {
  let hits = 0;
  const up = http.createServer((req, res) => { hits++; res.end('{"model":"gpt-4o-mini"}'); });
  const port = await listen(up);
  const receipts = join(mkdtempSync(join(tmpdir(), "cc-unk-")), "r.jsonl");
  const { server } = await startMeteringProxy({ receiptsPath: receipts, upstreams: { openai: `http://127.0.0.1:${port}` }, cap: createCapEngine({}) });
  const call = () => fetch(`http://127.0.0.1:${server.address().port}/openai/v1/chat/completions`, { method: "POST", body: "{}" });
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 429);
  const ledger = readFileSync(receipts, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(ledger[0].cost_usd, null);
  assert.equal(hits, 1);
  const restarted = createCapEngine({ history: ledger });
  assert.equal(restarted.check().reason, "unreconciled_receipt");
  assert.equal(restarted.spend().unknown, 1);
  assert.equal(restarted.spend().run, 0);
  server.close();
  up.close();
});

test("SSE fixtures for OpenAI, Anthropic and Gemini are buffered then metered", async (t) => {
  let upstreamFinished = 0;
  const routes = [
    ["/openai/v1/chat/completions", "/v1/chat/completions", 'data: {"model":"gpt-4o-mini","usage":{"prompt_tokens":1000,"completion_tokens":0}}\n\n'],
    ["/anthropic/v1/messages", "/v1/messages", 'data: {"message":{"model":"gpt-4o","usage":{"input_tokens":1000,"cache_creation_input_tokens":0,"output_tokens":0}}}\n\ndata: {"usage":{"output_tokens":0}}\n\n'],
    ["/gemini/v1beta/models/gemini-2.0-flash:generateContent", "/v1beta/models/gemini-2.0-flash:generateContent", 'data: {"modelVersion":"gemini-2.0-flash","usageMetadata":{"promptTokenCount":1000,"candidatesTokenCount":0}}\n\n'],
  ];
  const byUpstream = Object.fromEntries(routes.map(([, upstreamPath, body]) => [upstreamPath, body]));
  const up = http.createServer((req, res) => {
    const body = byUpstream[req.url];
    if (!body) { res.writeHead(404).end("missing"); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(body.slice(0, 8));
    setTimeout(() => { upstreamFinished = Date.now(); res.end(body.slice(8)); }, 200);
  });
  const port = await listen(up);
  const receipts = join(mkdtempSync(join(tmpdir(), "cc-sse-")), "r.jsonl");
  const base = `http://127.0.0.1:${port}`;
  const { server } = await startMeteringProxy({ receiptsPath: receipts, upstreams: { openai: base, anthropic: base, gemini: base }, cap: createCapEngine({}) });
  t.after(() => { server.closeAllConnections(); server.close(); up.closeAllConnections(); up.close(); });
  const proxy = server.address().port;
  for (const [proxyPath] of routes) {
    upstreamFinished = 0;
    let firstByte = 0;
    await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${proxy}${proxyPath}`, { method: "POST" }, (res) => {
        res.on("data", () => { if (!firstByte) firstByte = Date.now(); });
        res.on("end", resolve);
      });
      req.on("error", reject);
      req.end("{}");
    });
    assert.ok(firstByte >= upstreamFinished, proxyPath);
  }
  const ledger = readFileSync(receipts, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(ledger.map((r) => r.provider), ["openai", "anthropic", "gemini"]);
  assert.ok(ledger.every((r) => r.cost_usd > 0 && r.table_version === TABLE_VERSION));
});

test("Anthropic cache creation is priced at the input rate", () => {
  const parsed = extractUsage("anthropic", JSON.stringify({ model: "gpt-4o", usage: { input_tokens: 0, cache_creation_input_tokens: 1_000_000, output_tokens: 0 } }));
  const cost = costForUsage(parsed.model, parsed.usage);
  assert.equal(parsed.usage.input_tokens, 1_000_000);
  assert.equal(cost.cost_usd, 2.5);
  assert.notEqual(cost.cost_usd, 1.25);
});

test("metering proxy binds to 127.0.0.1", async () => {
  const { server } = await startMeteringProxy({});
  assert.equal(server.address().address, "127.0.0.1");
  server.close();
});

test("default kill file is relative to the working directory", () => {
  assert.equal(DEFAULT_KILL_FILE, ".costcap/KILL");
  const dir = mkdtempSync(join(tmpdir(), "cc-cwd-"));
  const cli = new URL("../src/cli.js", import.meta.url).pathname;
  const stopped = spawnSync(process.execPath, [cli, "kill", "pause"], { cwd: dir });
  assert.equal(stopped.status, 0, stopped.stderr?.toString());
  assert.equal(readFileSync(join(dir, ".costcap/KILL"), "utf8").trim(), "pause");
  const resumed = spawnSync(process.execPath, [cli, "resume"], { cwd: dir });
  assert.equal(resumed.status, 0);
  assert.equal(existsSync(join(dir, ".costcap/KILL")), false);
});

test("wrap sends SIGKILL after 5 seconds when the child ignores SIGTERM", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sig-"));
  const killFile = join(dir, "KILL");
  const termed = join(dir, "termed");
  const script = `process.on("SIGTERM",()=>require("node:fs").writeFileSync(${JSON.stringify(termed)},"1"));setInterval(()=>{},1000)`;
  const started = Date.now();
  const child = spawn(process.execPath, ["src/cli.js", "wrap", "--receipts", join(dir, "r.jsonl"), "--kill-file", killFile, "--", process.execPath, "-e", script], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 200));
  kill(killFile, "stop");
  const code = await new Promise((resolve) => child.on("exit", resolve));
  const elapsed = Date.now() - started;
  assert.equal(code, 143);
  assert.equal(readFileSync(termed, "utf8"), "1");
  assert.ok(elapsed >= 5000, `elapsed ${elapsed}`);
  assert.ok(elapsed < 12000, `elapsed ${elapsed}`);
});

test("wrap enforces day-cap and month-cap from the CLI", async () => {
  let hits = 0;
  const up = http.createServer((req, res) => { hits++; res.end('{"model":"gpt-4o-mini","usage":{"prompt_tokens":10,"completion_tokens":0}}'); });
  const port = await listen(up);
  const dir = mkdtempSync(join(tmpdir(), "cc-period-"));
  const now = new Date();
  const today = now.toISOString();
  const monthOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
  const olderThisMonth = now.getUTCDate() === 1 ? today : monthOnly;
  async function run(name, flags, row) {
    const before = hits;
    const receipts = join(dir, `${name}.jsonl`);
    writeFileSync(receipts, JSON.stringify(row) + "\n");
    const code = `fetch(process.env.OPENAI_BASE_URL+"/chat/completions",{method:"POST",body:"{}"}).then(r=>console.log(r.status))`;
    const child = spawn(process.execPath, ["src/cli.js", "wrap", ...flags, "--receipts", receipts, "--kill-file", join(dir, `${name}.KILL`), "--", process.execPath, "--input-type=module", "-e", code], { env: { ...process.env, COSTCAP_TEST_OPENAI_UPSTREAM: `http://127.0.0.1:${port}` } });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    const status = await new Promise((resolve) => child.on("exit", resolve));
    const ledger = readFileSync(receipts, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(status, 0, name);
    assert.equal(out.replace(/\x1b\[[0-9;]*m/g, "").trim(), "429", name);
    assert.equal(hits, before, name);
    return ledger.at(-1);
  }
  const day = await run("day", ["--day-cap", "0.50"], { id: "seed-day", ts: today, cost_usd: 1, model: "gpt-4o-mini" });
  assert.equal(day.scope, "day");
  const month = await run("month", ["--month-cap", "0.50", "--day-cap", "100"], { id: "seed-month", ts: olderThisMonth, cost_usd: 1, model: "gpt-4o-mini" });
  assert.equal(month.scope, "month");
  up.close();
});
