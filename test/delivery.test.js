import test from "node:test";
import assert from "node:assert/strict";
import { createAlertDelivery } from "../src/hosted/delivery.js";

test("unconfigured delivery is explicit, never calls provider", async () => {
  const send = createAlertDelivery({ fetchImpl: () => { throw new Error("must not call"); } });
  assert.deepEqual(await send({ kind: "cap_hit" }), [{ channel: "email", status: "unconfigured" }, { channel: "slack", status: "unconfigured" }]);
});
test("each channel reports acceptance or failure independently", async () => {
  const requests = [];
  const send = createAlertDelivery({ emailKey: "test-key", emailFrom: "test@example.invalid", emailTo: ["admin@example.invalid"], slackWebhook: "https://hooks.slack.com/services/test/test/test",
    fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: url.includes("api.brevo.com"), status: url.includes("api.brevo.com") ? 200 : 503 }; } });
  const results = await send({ kind: "cap_hit", agentId: "worker", scope: "day" });
  assert.equal(results[0].status, "accepted");
  assert.equal(results[1].status, "failed");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.redirect, "error");
  assert.match(JSON.parse(requests[0].options.body).textContent, /not a billing guarantee/);
});
test("invalid webhook origins are rejected before delivery", () => {
  assert.throws(() => createAlertDelivery({ slackWebhook: "http://hooks.slack.com/services/a" }), /HTTPS/);
  assert.throws(() => createAlertDelivery({ slackWebhook: "https://evil.invalid/services/a" }), /Slack webhook/);
});
