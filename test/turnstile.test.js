import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { verifyProductionChallenge } from "../src/hosted/turnstile.js";

const token = "fixture-" + "pass";

test("production Turnstile check calls siteverify and rejects a failed fixture token", async () => {
  let calls = 0;
  const accepted = await verifyProductionChallenge({
    response: token,
    remoteip: "127.0.0.1",
    secret: "not-a-real-secret",
    origin: "https://app.costcap.dev",
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
      assert.equal(JSON.parse(init.body).response, token);
      return { ok: true, json: async () => ({ success: false, hostname: "app.costcap.dev" }) };
    },
  });
  assert.equal(accepted, false);
  assert.equal(calls, 1);
});

test("production Turnstile check requires the configured hostname", async () => {
  const mismatch = await verifyProductionChallenge({
    response: "cloudflare-token",
    remoteip: "127.0.0.1",
    secret: "not-a-real-secret",
    origin: "https://app.costcap.dev",
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, hostname: "other.example" }) }),
  });
  const match = await verifyProductionChallenge({
    response: "cloudflare-token",
    remoteip: "127.0.0.1",
    secret: "not-a-real-secret",
    origin: "https://app.costcap.dev",
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, hostname: "app.costcap.dev" }) }),
  });
  assert.equal(mismatch, false);
  assert.equal(match, true);
});

test("production launcher rejects fixture switches and does not embed the fixture token", () => {
  const source = readFileSync(new URL("../src/hosted/run.js", import.meta.url), "utf8");
  assert.match(source, /verifyProductionChallenge/);
  assert.equal(source.includes(token), false);
  const result = spawnSync(process.execPath, ["src/hosted/run.js"], {
    env: { ...process.env, COSTCAP_TURNSTILE_FIXTURE: "1", COSTCAP_EMAIL_FIXTURE: "1" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}`, /Production launcher rejects test fixtures/);
});
