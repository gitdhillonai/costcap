import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostedServer } from "../src/hosted/server.js";

test("hosted request logs are JSON and omit secrets", async (t) => {
  const lines = [];
  const secret = "bearer-" + "do-not-log";
  const mail = "person@" + "example.invalid";
  const invite = "invite-" + "do-not-log";
  const session = "session-" + "do-not-log";
  const service = createHostedServer({
    storePath: join(mkdtempSync(join(tmpdir(), "cc-log-")), "store.json"),
    origin: "http://localhost",
    secureCookies: false,
    verifyChallenge: async () => false,
    sendCode: async () => {},
    requestLog: (line) => lines.push(line),
  });
  t.after(() => { service.server.closeAllConnections(); service.server.close(); });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const health = await fetch(`${base}/health?token=${secret}`, { headers: { authorization: `Bearer ${secret}`, cookie: `costcap_session=${session}` } });
  const healthBody = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthBody.billing, "disabled");
  assert.equal(JSON.stringify(healthBody).includes(secret), false);
  const denied = await fetch(`${base}/auth/request`, {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json", authorization: `Bearer ${invite}` },
    body: JSON.stringify({ email: mail, turnstileToken: secret, code: "12345678" }),
  });
  assert.equal(denied.status, 403);
  assert.equal(lines.length, 2);
  for (const line of lines) {
    const entry = JSON.parse(line);
    assert.deepEqual(Object.keys(entry).sort(), ["durationMs", "method", "path", "status"]);
    assert.equal(typeof entry.durationMs, "number");
    assert.equal(line.includes(secret), false);
    assert.equal(line.includes(mail), false);
    assert.equal(line.includes(invite), false);
    assert.equal(line.includes(session), false);
    assert.equal(line.includes("authorization"), false);
    assert.equal(line.includes("cookie"), false);
  }
  assert.deepEqual(JSON.parse(lines[0]), { ...JSON.parse(lines[0]), method: "GET", path: "/health", status: 200 });
  assert.equal(JSON.parse(lines[1]).path, "/auth/request");
  assert.equal(JSON.parse(lines[1]).status, 403);
  const launcher = readFileSync(new URL("../src/hosted/run.js", import.meta.url), "utf8");
  assert.match(launcher, /requestLog: \(line\) => process\.stderr\.write/);
});
