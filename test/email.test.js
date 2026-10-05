import test from "node:test";
import assert from "node:assert/strict";
import { createTransactionalEmail } from "../src/hosted/email.js";
import { createAlertDelivery } from "../src/hosted/delivery.js";
test("Brevo sends proper auth, addresses and escaped HTML", async () => {
  let sent;
  const send = createTransactionalEmail({ provider: "brevo", apiKey: "test", from: "CostCap <noreply@costcap.dev>", fetchImpl: async (url, opts) => { sent = { url, opts }; return { ok: true }; } });
  assert.equal((await send({ to: ["qa@example.invalid"], subject: "Code", text: '<test>&' })).status, "accepted");
  assert.equal(sent.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(sent.opts.headers['api-key'], "test");
  const body = JSON.parse(sent.opts.body);
  assert.equal(body.sender.email, "noreply@costcap.dev");
  assert.deepEqual(body.to, [{ email: "qa@example.invalid" }]);
  assert.equal(body.htmlContent, '<pre>&lt;test&gt;&amp;</pre>');
  assert.equal(sent.opts.redirect, "error");
});
test("Resend stays compatible and failure does not silently switch providers", async () => {
  let calls = 0;
  const send = createTransactionalEmail({ apiKey: "test", from: "noreply@costcap.dev", fetchImpl: async (url, opts) => { calls++; assert.equal(url, "https://api.resend.com/emails"); assert.equal(opts.headers.authorization, "Bearer test"); return { ok: false, status: 429 }; } });
  await assert.rejects(send({ to: ["qa@example.invalid"], subject: "test", text: "test" }), /429/);
  assert.equal(calls, 1);
  assert.throws(() => createTransactionalEmail({ provider: "other", apiKey: "test", from: "noreply@costcap.dev" }));
});
test("alert delivery uses Brevo adapter and reports missing Slack explicitly", async () => {
  const send = createAlertDelivery({ emailProvider: "brevo", emailKey: "test", emailFrom: "noreply@costcap.dev", emailTo: ["qa@example.invalid"], fetchImpl: async (url) => { assert.equal(url, "https://api.brevo.com/v3/smtp/email"); return { ok: true }; } });
  assert.deepEqual(await send({ kind: "cap_hit" }), [{ channel: "email", status: "accepted" }, { channel: "slack", status: "unconfigured" }]);
});
