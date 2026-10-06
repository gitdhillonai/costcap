import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createTransactionalEmail } from "../src/hosted/email.js";
import { createAlertDelivery } from "../src/hosted/delivery.js";

test("Brevo sends proper auth, addresses and escaped HTML", async () => {
  let sent;
  const send = createTransactionalEmail({ apiKey: "test", from: "CostCap <noreply@costcap.dev>", fetchImpl: async (url, opts) => { sent = { url, opts }; return { ok: true }; } });
  assert.equal((await send({ to: ["qa@example.invalid"], subject: "Code", text: "<test>&" })).provider, "brevo");
  assert.equal(sent.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(sent.opts.headers["api-key"], "test");
  assert.equal(sent.opts.headers.authorization, undefined);
  const body = JSON.parse(sent.opts.body);
  assert.equal(body.sender.email, "noreply@costcap.dev");
  assert.deepEqual(body.to, [{ email: "qa@example.invalid" }]);
  assert.equal(body.htmlContent, "<pre>&lt;test&gt;&amp;</pre>");
  assert.equal(sent.opts.redirect, "error");
});

test("non-Brevo providers are rejected and a Brevo failure is not retried elsewhere", async () => {
  assert.throws(() => createTransactionalEmail({ provider: "resend", apiKey: "test", from: "noreply@costcap.dev" }), /Brevo only/);
  let calls = 0;
  const send = createTransactionalEmail({ apiKey: "test", from: "noreply@costcap.dev", fetchImpl: async (url, opts) => { calls++; assert.equal(url, "https://api.brevo.com/v3/smtp/email"); assert.equal(opts.headers["api-key"], "test"); return { ok: false, status: 429 }; } });
  await assert.rejects(send({ to: ["qa@example.invalid"], subject: "test", text: "test" }), /429/);
  assert.equal(calls, 1);
});

test("alert delivery uses the Brevo adapter and reports missing Slack explicitly", async () => {
  const send = createAlertDelivery({ emailKey: "test", emailFrom: "noreply@costcap.dev", emailTo: ["qa@example.invalid"], fetchImpl: async (url) => { assert.equal(url, "https://api.brevo.com/v3/smtp/email"); return { ok: true }; } });
  assert.deepEqual(await send({ kind: "cap_hit" }), [{ channel: "email", status: "accepted" }, { channel: "slack", status: "unconfigured" }]);
});

test("production launcher rejects a non-Brevo mail provider before listening", () => {
  const result = spawnSync(process.execPath, ["src/hosted/run.js"], {
    env: { ...process.env, COSTCAP_ORIGIN: "https://app.costcap.dev", TURNSTILE_SECRET_KEY: "not-a-real-secret", TURNSTILE_SITE_KEY: "not-a-real-site-key", COSTCAP_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "not-a-real-secret", BREVO_API_KEY: "not-a-real-secret", COSTCAP_EMAIL_FROM: "noreply@costcap.dev", PORT: "0" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}`, /brevo/i);
});
