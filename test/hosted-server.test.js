import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostedServer } from "../src/hosted/server.js";

async function fixture(t) {
  let code, delivery = [], failDelivery = false, invites = [], failInvite = false;
  const storePath = join(mkdtempSync(join(tmpdir(), "cc-service-")), "store.json");
  let service;
  const origin = "http://localhost";
  const start = async () => {
    service = createHostedServer({ storePath, origin, secureCookies: false, verifyChallenge: async (value) => value === "test-pass", sendCode: async (data) => { code = data.code; }, sendInvite: async (data) => { if (failInvite) throw new Error("mail down"); invites.push(data); }, deliverAlert: async (a) => { delivery.push(a); return [{ status: failDelivery ? "failed" : "accepted" }]; } });
    await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
  };
  await start();
  t.after(() => { service.server.closeAllConnections(); service.server.close(); });
  const request = async (path, body, cookie, auth, originValue = origin) => {
    const r = await fetch(`http://127.0.0.1:${service.server.address().port}${path}`, { method: body === undefined ? "GET" : "POST", headers: { origin: originValue, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json(), cookie: r.headers.get("set-cookie")?.split(";")[0] };
  };
  const login = async (email) => {
    const challenge = await request("/auth/request", { email, turnstileToken: "test-pass" });
    assert.equal(challenge.status, 200);
    const r = await request("/auth/verify", { challengeId: challenge.body.challengeId, code });
    assert.equal(r.status, 200);
    return r;
  };
  return { request, login, service: () => service, delivery, invites: () => invites, setFail: (v) => { failDelivery = v; }, setInviteFail: (v) => { failInvite = v; }, restart: async () => { service.server.closeAllConnections(); await new Promise((r) => service.server.close(r)); await start(); } };
}

test("verified org-first login, tenant isolation, enrollment, receipt sync and restart", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/v1/fleet")).status, 401);
  assert.equal((await f.request("/auth/request", { email: "a@example.invalid", turnstileToken: "bad" })).status, 403);
  assert.equal((await f.request("/auth/request", { email: "a@example.invalid", turnstileToken: "test-pass" }, null, null, "https://evil.invalid")).status, 403);
  const owner = await f.login("owner@example.invalid");
  const outsider = await f.login("outsider@example.invalid");
  assert.notEqual(owner.body.orgId, outsider.body.orgId); // domain match is not membership
  const enrollment = await f.request("/v1/enrollment-tokens", { caps: { day: 1 } }, owner.cookie);
  const enrolled = await f.request("/v1/enroll", { name: "worker" }, null, enrollment.body.token);
  assert.equal(enrolled.status, 201);
  assert.equal((await f.request("/v1/enroll", { name: "replay" }, null, enrollment.body.token)).status, 401);
  const agent = enrolled.body;
  assert.equal((await f.request(`/v1/agents/${agent.agentId}/policy`, { caps: { day: 100 } }, outsider.cookie)).status, 404);
  const updated = await f.request(`/v1/agents/${agent.agentId}/policy`, { killed: true }, owner.cookie);
  assert.equal(updated.body.version, 2);
  const receipt = { id: "r-1", ts: new Date().toISOString(), cost_usd: 0.9, model: "test-model" };
  assert.equal((await f.request("/v1/receipts", { receipts: [receipt] }, null, agent.token)).status, 200);
  assert.equal((await f.request("/v1/receipts", { receipts: [receipt] }, null, agent.token)).status, 200);
  assert.equal((await f.request("/v1/receipts", { receipts: [{ ...receipt, cost_usd: 3 }] }, null, agent.token)).status, 409);
  let fleet = await f.request("/v1/fleet", undefined, owner.cookie);
  assert.equal(fleet.body.receipts.length, 1);
  assert.equal(fleet.body.agents[0].hash, undefined);
  assert.equal((await f.request("/v1/fleet", undefined, outsider.cookie)).body.receipts.length, 0);
  await f.restart();
  assert.equal((await f.request("/v1/policy", undefined, null, agent.token)).body.killed, true);
  f.setFail(true);
  await f.service().evaluateFleetAlerts();
  assert.equal(f.delivery.length, 1);
  f.setFail(false);
  await f.service().evaluateFleetAlerts();
  assert.equal(f.delivery.length, 2);
  await f.service().evaluateFleetAlerts();
  assert.equal(f.delivery.length, 2);
  fleet = await f.request("/v1/fleet", undefined, owner.cookie);
  assert.ok(fleet.body.audit.some((e) => e.action === "alert.delivery"));
  assert.equal((await f.request(`/v1/agents/${agent.agentId}/revoke`, {}, owner.cookie)).status, 200);
  assert.equal((await f.request("/v1/policy", undefined, null, agent.token)).status, 401);
  await f.request("/auth/logout", {}, owner.cookie);
  assert.equal((await f.request("/v1/fleet", undefined, owner.cookie)).status, 401);
});

test("billing stays disabled and there is no charge route", async (t) => {
  const f = await fixture(t);
  const health = await f.request("/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.billing, "disabled");
  assert.equal(health.body.beta, true);
  assert.equal(health.body.persistence, "single-process-file");
  assert.equal(health.body.sha, null);
  // /health reports the real package version, never a hardcoded copy that can drift.
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(health.body.version, pkg.version);
  const owner = await f.login("billing@example.invalid");
  const fleet = await f.request("/v1/fleet", undefined, owner.cookie);
  assert.equal(fleet.body.billing, "disabled");
  assert.equal((await f.request("/billing")).status, 404);
  assert.equal((await f.request("/stripe/checkout", {})).status, 404);
});

test("an invitation joins that org and a viewer cannot change policy or invite", async (t) => {
  const f = await fixture(t);
  const owner = await f.login("owner@example.invalid");
  assert.equal((await f.request("/v1/invitations", { email: "not-an-email", role: "viewer" }, owner.cookie)).status, 400);
  assert.equal((await f.request("/v1/invitations", { email: "viewer@example.invalid", role: "owner" }, owner.cookie)).status, 400);
  const invited = await f.request("/v1/invitations", { email: "viewer@example.invalid", role: "viewer" }, owner.cookie);
  assert.equal(invited.status, 201);
  assert.equal(f.invites().length, 1);
  assert.equal(f.invites()[0].orgName, "example.invalid");
  assert.equal((await f.request("/v1/invitations", { email: "viewer@example.invalid", role: "viewer" }, owner.cookie)).status, 409);
  const stranger = await f.login("stranger@example.invalid");
  assert.notEqual(stranger.body.orgId, owner.body.orgId);
  const viewer = await f.login("viewer@example.invalid");
  assert.equal(viewer.body.orgId, owner.body.orgId);
  assert.equal(viewer.body.role, "viewer");
  const fleet = await f.request("/v1/fleet", undefined, viewer.cookie);
  assert.equal(fleet.body.role, "viewer");
  assert.equal(fleet.body.invitations.length, 0);
  assert.equal((await f.request("/v1/enrollment-tokens", { caps: { day: 1 } }, viewer.cookie)).status, 403);
  assert.equal((await f.request("/v1/invitations", { email: "other@example.invalid", role: "viewer" }, viewer.cookie)).status, 403);
  const enrollment = await f.request("/v1/enrollment-tokens", { caps: { day: 1 } }, owner.cookie);
  const agent = await f.request("/v1/enroll", { name: "worker" }, null, enrollment.body.token);
  assert.equal((await f.request(`/v1/agents/${agent.body.agentId}/policy`, { killed: true }, viewer.cookie)).status, 403);
  const ownerFleet = await f.request("/v1/fleet", undefined, owner.cookie);
  assert.equal(ownerFleet.body.invitations.length, 0);
  const pending = await f.request("/v1/invitations", { email: "later@example.invalid", role: "admin" }, owner.cookie);
  assert.equal(pending.status, 201);
  assert.equal((await f.request(`/v1/invitations/${pending.body.id}/revoke`, {}, owner.cookie)).status, 200);
  const later = await f.login("later@example.invalid");
  assert.notEqual(later.body.orgId, owner.body.orgId);
  assert.equal(later.body.role, "owner");
  f.setInviteFail(true);
  assert.equal((await f.request("/v1/invitations", { email: "second@example.invalid", role: "admin" }, owner.cookie)).status, 503);
  assert.equal((await f.request("/v1/fleet", undefined, owner.cookie)).body.invitations.length, 0);
  assert.equal((await f.request("/v1/invitations", { email: "owner@example.invalid", role: "admin" }, owner.cookie)).status, 409);
});

test("verification wrong-code attempt limit persists and challenge is one-use", async (t) => {
  const f = await fixture(t);
  const challenge = await f.request("/auth/request", { email: "attempt@example.invalid", turnstileToken: "test-pass" });
  for (let i = 0; i < 6; i++) assert.equal((await f.request("/auth/verify", { challengeId: challenge.body.challengeId, code: "wrong" })).status, 401);
  const result = await f.request("/auth/verify", { challengeId: challenge.body.challengeId, code: "wrong" });
  assert.match(result.body.error, /expired/);
  assert.equal((await f.request("/v1/enrollment-tokens", { caps: {} })).status, 401);
});
