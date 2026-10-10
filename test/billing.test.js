import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostedServer } from "../src/hosted/server.js";

test("the default server and a billing flag do not create a charge route", async (t) => {
  const service = createHostedServer({
    storePath: join(mkdtempSync(join(tmpdir(), "cc-bill-")), "store.json"),
    origin: "http://localhost",
    secureCookies: false,
    verifyChallenge: async () => false,
    sendCode: async () => {},
  });
  t.after(() => { service.server.closeAllConnections(); service.server.close(); });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const health = await fetch(`${base}/health`);
  assert.equal((await health.json()).billing, "disabled");
  const charge = await fetch(`${base}/billing`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{}" });
  assert.equal(charge.status, 404);
  const flagged = spawnSync(process.execPath, ["src/hosted/run.js"], {
    encoding: "utf8",
    env: {
      ...process.env,
      COSTCAP_ORIGIN: "https://app.example.invalid",
      TURNSTILE_SITE_KEY: "public-placeholder",
      TURNSTILE_SECRET_KEY: "not-a-real-secret",
      COSTCAP_EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "not-a-real-secret",
      COSTCAP_EMAIL_FROM: "noreply@example.invalid",
      COSTCAP_BILLING: "enabled",
      PORT: "0",
      COSTCAP_STORE_PATH: join(mkdtempSync(join(tmpdir(), "cc-bill-launch-")), "store.json"),
    },
  });
  assert.notEqual(flagged.status, 0);
  assert.match(flagged.stderr, /COSTCAP_STRIPE_SECRET_KEY required/);
  const source = readFileSync(new URL("../src/hosted/run.js", import.meta.url), "utf8");
  assert.ok(source.includes("await billingReady"));
  assert.equal(readFileSync(new URL("../package.json", import.meta.url), "utf8").includes("stripe"), false);
});
