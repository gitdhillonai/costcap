import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, statSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enroll, createFleetClient, loadEnrollment, serviceUrl } from "../src/hosted/client.js";

async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "cc-fleet-"));
  const path = join(dir, "enrollment.json"), receiptsPath = join(dir, "receipts.jsonl");
  let version = 1, killed = false, status = 200, received = [], enrolls = 0;
  const server = http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/enroll") {
      assert.equal(req.headers.authorization, "Bearer enrollment-token");
      enrolls++;
      res.end(JSON.stringify({ agentId: "agent-1", token: "agent-token", policy: { version, caps: { run: 2 }, killed } }));
    } else {
      assert.equal(req.headers.authorization, "Bearer agent-token");
      if (status !== 200) { res.writeHead(status).end('{}'); return; }
      if (req.url === "/v1/policy") res.end(JSON.stringify({ version, caps: { run: 1 }, killed }));
      else {
        const receipts = JSON.parse(body).receipts;
        received.push(...receipts);
        res.end(JSON.stringify({ acceptedIds: receipts.map((r) => r.id) }));
      }
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  await enroll({ url, token: "enrollment-token", name: "test agent", path });
  return { path, receiptsPath, server, received, update: (v, k = false, s = 200) => { version = v; killed = k; status = s; }, enrolls };
}

test("enrollment requires secure origin, validates cache and keeps credentials private", async (t) => {
  assert.throws(() => serviceUrl("http://example.com"), /HTTPS/);
  assert.throws(() => serviceUrl("https://user:secret@example.com"), /credentials/);
  const f = await setup(t);
  assert.equal(statSync(f.path).mode & 0o777, 0o600);
  assert.equal(loadEnrollment(f.path).agentId, "agent-1");
});

test("policy updates, cache, receipt acknowledgments and offline behavior", async (t) => {
  const f = await setup(t);
  appendFileSync(f.receiptsPath, JSON.stringify({ id: "r1", ts: new Date().toISOString(), cost_usd: 0.1 }) + "\n");
  let changed;
  const client = createFleetClient({ ...f, onPolicy: (p) => { changed = p; } });
  f.update(2, true);
  assert.equal((await client.sync()).online, true);
  assert.equal(client.policy().killed, true);
  assert.equal(changed.caps.run, 1);
  assert.equal(f.received.length, 1);
  await client.sync();
  assert.equal(f.received.length, 1);
  f.update(2, false); // same version must not resume
  await client.sync();
  assert.equal(client.policy().killed, true);
  f.server.closeAllConnections(); f.server.close();
  const offline = await client.sync();
  assert.equal(offline.online, false);
  assert.equal(client.policy().killed, true);
  const restarted = createFleetClient(f);
  assert.equal(restarted.policy().version, 2);
  assert.ok(!readFileSync(f.path, "utf8").includes("enrollment-token"));
});

test("revocation is not treated as harmless offline", async (t) => {
  const f = await setup(t);
  const client = createFleetClient(f);
  f.update(2, false, 403);
  const result = await client.sync();
  assert.equal(result.revoked, true);
  assert.equal(client.revoked(), true);
});
