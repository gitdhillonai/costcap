// Free-beta API. Durable local datastore, exactly one replica, trusted TLS ingress.
// Existing company membership is never inferred from an email domain.
import http from "node:http";
import { uiResponse } from "./ui.js";
import { randomBytes, randomUUID, randomInt } from "node:crypto";
import { openStore } from "./store.js";
import { hashToken, validatePolicy } from "./policy.js";
import { evaluateAlerts, auditEntry } from "./alerts.js";
import { VERSION } from "../version.js";
const token = () => randomBytes(32).toString("base64url");
const fail = (status, message) => { const err = new Error(message); err.status = status; throw err; };
const audit = (s, orgId, actor, action, target, detail = {}) => s.audit.push(auditEntry({ orgId, actor, action, target, detail }));

// Estimated receipt spend for the dashboard. Null cost is unknown, never zero.
export function spendSummary(receipts, nowMs) {
  const utc = new Date(nowMs).toISOString();
  const fold = (prefix) => {
    let usd = 0, unknown = 0;
    for (const item of receipts) {
      const r = item.receipt ?? item;
      if (prefix && (typeof r.ts !== "string" || !r.ts.startsWith(prefix))) continue;
      if (r.cost_usd === null || r.cost_usd === undefined) unknown += 1;
      else usd += r.cost_usd;
    }
    return { usd, unknown };
  };
  return { day: fold(utc.slice(0, 10)), month: fold(utc.slice(0, 7)), all: fold("") };
}

export function createHostedServer({ storePath, verifyChallenge, sendCode, sendInvite, deliverAlert,
  now = () => Date.now(), secureCookies = true, origin, turnstileSiteKey = "", bodyLimit = 256_000,
  requestLog = () => {}, billingFactory } = {}) {
  if (!storePath || !verifyChallenge || !sendCode || !origin) throw new Error("Store, origin, Turnstile verifier and authorized code sender required");
  const store = openStore(storePath);
  let billing;
  const billingReady = billingFactory ? Promise.resolve().then(() => billingFactory(store)).then(b => { billing = b; }) : Promise.resolve();
  const rate = new Map();
  const sessionUser = (s, req) => {
    const cookie = /(?:^|;\s*)costcap_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    const found = cookie && s.sessions[hashToken(cookie)];
    if (!found || found.expires <= now()) fail(401, "Verified session required");
    const user = s.users[found.userId];
    if (!user?.verified) fail(401, "Email verification required");
    return user;
  };
  const agentUser = (s, req) => {
    const credential = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const hashed = hashToken(credential);
    const agent = Object.values(s.agents).find((a) => a.hash === hashed && !a.revoked);
    if (!agent) fail(401, "Agent credential invalid or revoked");
    return agent;
  };
  const admin = (s, req) => { const u = sessionUser(s, req); if (!["owner", "admin"].includes(u.role)) fail(403, "Admin role required"); return u; };
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    let logged = false;
    res.on("finish", () => {
      if (logged) return;
      logged = true;
      let path = "/";
      try { path = new URL(req.url ?? "/", origin).pathname; } catch { path = "/"; }
      const line = JSON.stringify({ method: req.method, path, status: res.statusCode, durationMs: Date.now() - started });
      try { requestLog(line); } catch { /* a log sink failure must not change the response */ }
    });
    const json = (status, value, headers = {}) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers }).end(JSON.stringify(value));
    try {
      const path = new URL(req.url, origin).pathname;
      if (req.method === "GET") {
        const ui = uiResponse(path, turnstileSiteKey, origin, Boolean(billing));
        if (ui) return res.writeHead(200, ui.headers).end(ui.body);
      }
      if (req.method === "GET" && path === "/health") return json(200, { status: "ok", product: "CostCap", beta: true, billing: billing ? "enabled" : "disabled", persistence: "single-process-file", version: VERSION, sha: process.env.COSTCAP_GIT_SHA || null });
      const browserMutation = req.method !== "GET" && !req.headers.authorization;
      if (browserMutation && !(billing && path === "/billing/webhook") && req.headers.origin !== origin) fail(403, "Origin rejected");
      let text = "";
      for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > bodyLimit) fail(413, "Body too large"); }
      if (billing && path === "/billing/webhook" && req.method === "POST") return json(200, await billing.webhook(text, req.headers["stripe-signature"]));
      if (billing && path.startsWith("/billing/") && ["GET", "POST"].includes(req.method)) {
        if (req.method === "POST" && req.headers.origin !== origin) fail(403, "Origin rejected");
        const user = store.read(s => sessionUser(s, req));
        if (path === "/billing/status" && req.method === "GET") return json(200, await billing.status(user.orgId));
        if (user.role !== "owner") fail(403, "Workspace owner required");
        if (path === "/billing/checkout" && req.method === "POST") return json(200, await billing.checkout(user));
        if (path === "/billing/portal" && req.method === "POST") return json(200, await billing.portal(user.orgId));
      }
      let body;
      try { body = text ? JSON.parse(text) : {}; } catch { fail(400, "Invalid JSON"); }
      if (path === "/auth/request" && req.method === "POST") {
        const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
        if (!/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]{2,40}$/.test(email)) fail(400, "Valid email required");
        const key = req.socket.remoteAddress;
        if (rate.size > 10000) rate.clear();
        const recent = (rate.get(key) ?? []).filter((ts) => ts > now() - 3600_000);
        if (recent.length >= 5) fail(429, "Try later");
        if (!await verifyChallenge(body.turnstileToken, req.socket.remoteAddress)) fail(403, "Challenge failed");
        rate.set(key, [...recent, now()]);
        const code = String(randomInt(10000000, 100000000));
        const challengeId = token();
        store.transaction((s) => { s.challenges[hashToken(challengeId)] = { email, code: hashToken(code), expires: now() + 600_000, attempts: 0 }; });
        try { await sendCode({ email, code }); }
        catch { store.transaction((s) => { delete s.challenges[hashToken(challengeId)]; }); fail(503, "Verification delivery unavailable"); }
        return json(200, { challengeId, expiresInSeconds: 600 });
      }
      if (path === "/auth/verify" && req.method === "POST") {
        const challengeHash = hashToken(String(body.challengeId ?? ""));
        const sessionToken = token();
        const result = store.transaction((s) => {
          const challenge = s.challenges[challengeHash];
          if (!challenge || challenge.expires <= now() || challenge.attempts >= 5) return { error: "Challenge expired" };
          challenge.attempts++;
          if (challenge.code !== hashToken(String(body.code ?? ""))) return { error: "Wrong code" };
          delete s.challenges[challengeHash];
          let user = Object.values(s.users).find((u) => u.email === challenge.email);
          if (!user) {
            s.invitations ??= {};
            const invite = Object.values(s.invitations).filter((item) => item.email === challenge.email && item.expires > now()).sort((a, b) => b.expires - a.expires)[0];
            const id = randomUUID();
            if (invite && ["admin", "viewer"].includes(invite.role) && s.orgs[invite.orgId]) {
              user = { id, email: challenge.email, orgId: invite.orgId, role: invite.role, verified: true };
              s.users[id] = user;
              delete s.invitations[invite.id];
              audit(s, invite.orgId, id, "invitation.accept", invite.id, { role: invite.role });
            } else {
              const orgId = randomUUID();
              s.orgs[orgId] = { id: orgId, name: challenge.email.split("@")[1], created: now() };
              user = { id, email: challenge.email, orgId, role: "owner", verified: true };
              s.users[id] = user;
              audit(s, orgId, id, "org.create", orgId);
            }
          }
          s.sessions[hashToken(sessionToken)] = { userId: user.id, expires: now() + 24 * 3600_000 };
          return { id: user.id, orgId: user.orgId, role: user.role };
        });
        if (result.error) fail(401, result.error);
        return json(200, result, { "set-cookie": `costcap_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secureCookies ? "; Secure" : ""}` });
      }
      if (path === "/auth/logout" && req.method === "POST") {
        store.transaction((s) => {
          sessionUser(s, req);
          const cookie = /(?:^|;\s*)costcap_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
          delete s.sessions[hashToken(cookie)];
        });
        return json(200, { ok: true }, { "set-cookie": "costcap_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
      }
      if (path === "/v1/enrollment-tokens" && req.method === "POST") {
        const raw = token();
        const policy = { version: 1, caps: body.caps ?? {}, killed: false };
        if (validatePolicy(policy).length) fail(400, "Invalid caps");
        store.transaction((s) => {
          const user = admin(s, req);
          s.enrollments[hashToken(raw)] = { orgId: user.orgId, policy, expires: now() + 600_000 };
          audit(s, user.orgId, user.id, "enrollment.issue", null);
        });
        return json(201, { token: raw, expiresInSeconds: 600 });
      }
      if (path === "/v1/enroll" && req.method === "POST") {
        const raw = token();
        const result = store.transaction((s) => {
          const h = hashToken((req.headers.authorization ?? "").replace(/^Bearer /, ""));
          const grant = s.enrollments[h];
          if (!grant || grant.expires <= now()) fail(401, "Enrollment invalid/expired/used");
          if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100) fail(400, "Agent name required");
          const id = randomUUID();
          s.agents[id] = { id, orgId: grant.orgId, name: body.name, hash: hashToken(raw), policy: grant.policy, lastSeen: now(), revoked: false };
          delete s.enrollments[h];
          audit(s, grant.orgId, id, "agent.enroll", id);
          return { agentId: id, token: raw, policy: grant.policy };
        });
        return json(201, result);
      }
      if (path === "/v1/policy" && req.method === "GET") {
        const p = store.transaction((s) => { const a = agentUser(s, req); a.lastSeen = now(); return a.policy; });
        return json(200, p);
      }
      if (path === "/v1/receipts" && req.method === "POST") {
        if (!Array.isArray(body.receipts) || body.receipts.length > 100) fail(400, "Up to 100 receipts required");
        const result = store.transaction((s) => {
          const a = agentUser(s, req);
          const acceptedIds = [];
          for (const r of body.receipts) {
            if (!r || typeof r.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(r.id) || !Number.isFinite(Date.parse(r.ts)) || (r.cost_usd !== null && (!Number.isFinite(r.cost_usd) || r.cost_usd < 0))) fail(400, "Invalid receipt");
            const key = `${a.id}:${r.id}`;
            if (s.receipts[key] && JSON.stringify(s.receipts[key].receipt) !== JSON.stringify(r)) fail(409, "Receipt ID content conflict");
            s.receipts[key] ??= { orgId: a.orgId, agentId: a.id, receipt: r };
            acceptedIds.push(r.id);
          }
          a.lastSeen = now();
          audit(s, a.orgId, a.id, "receipts.sync", a.id, { count: acceptedIds.length });
          return { acceptedIds };
        });
        return json(200, result);
      }
      if (path === "/v1/fleet" && req.method === "GET") {
        return json(200, store.read((s) => {
          const u = sessionUser(s, req);
          return { agents: Object.values(s.agents).filter((a) => a.orgId === u.orgId).map(({ hash, ...a }) => ({ ...a, spend: spendSummary(Object.values(s.receipts).filter((r) => r.agentId === a.id), now()) })),
            receipts: Object.values(s.receipts).filter((r) => r.orgId === u.orgId),
            audit: s.audit.filter((e) => e.org_id === u.orgId), alerts: Object.values(s.alerts).filter((a) => a.orgId === u.orgId),
            role: u.role, invitations: ["owner", "admin"].includes(u.role) ? Object.values(s.invitations ?? {}).filter((item) => item.orgId === u.orgId && item.expires > now()).map(({ invitedBy, ...item }) => item) : [],
            beta: true, billing: billing ? "enabled" : "disabled" };
        }));
      }
      if (path === "/v1/invitations" && req.method === "POST") {
        const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
        if (!/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]{2,40}$/.test(email)) fail(400, "Valid email required");
        if (!["admin", "viewer"].includes(body.role)) fail(400, "Role must be admin or viewer");
        if (!sendInvite) fail(503, "Invitation delivery unavailable");
        const id = randomUUID();
        const created = store.transaction((s) => {
          s.invitations ??= {};
          const user = admin(s, req);
          if (Object.values(s.users).some((u) => u.email === email)) fail(409, "That email already has an account");
          const pending = Object.values(s.invitations).filter((item) => item.orgId === user.orgId && item.expires > now());
          if (pending.some((item) => item.email === email)) fail(409, "An invite is already pending for that email");
          if (pending.length >= 20) fail(429, "Too many pending invitations");
          s.invitations[id] = { id, email, orgId: user.orgId, role: body.role, expires: now() + 7 * 24 * 3600_000, invitedBy: user.id };
          audit(s, user.orgId, user.id, "invitation.issue", id, { email, role: body.role });
          return { orgName: s.orgs[user.orgId].name };
        });
        try { await sendInvite({ email, role: body.role, orgName: created.orgName }); }
        catch {
          store.transaction((s) => { delete s.invitations?.[id]; });
          fail(503, "Invitation delivery unavailable");
        }
        return json(201, { id, email, role: body.role, expiresInSeconds: 7 * 24 * 3600 });
      }
      const inviteRevoke = /^\/v1\/invitations\/([^/]+)\/revoke$/.exec(path);
      if (inviteRevoke && req.method === "POST") {
        store.transaction((s) => {
          const user = admin(s, req);
          const invite = s.invitations?.[inviteRevoke[1]];
          if (!invite || invite.orgId !== user.orgId) fail(404, "Invitation not found");
          delete s.invitations[invite.id];
          audit(s, user.orgId, user.id, "invitation.revoke", invite.id);
        });
        return json(200, { revoked: true });
      }
      const update = /^\/v1\/agents\/([^/]+)\/(policy|revoke)$/.exec(path);
      if (update && req.method === "POST") {
        const result = store.transaction((s) => {
          const u = admin(s, req), a = s.agents[update[1]];
          if (!a || a.orgId !== u.orgId) fail(404, "Agent not found");
          if (update[2] === "revoke") { a.revoked = true; audit(s, u.orgId, u.id, "agent.revoke", a.id); return { revoked: true }; }
          const policy = { version: a.policy.version + 1, caps: body.caps ?? a.policy.caps, killed: body.killed ?? a.policy.killed };
          if (validatePolicy(policy).length) fail(400, "Invalid policy");
          a.policy = policy;
          audit(s, u.orgId, u.id, "policy.change", a.id, { policy });
          return policy;
        });
        return json(200, result);
      }
      fail(404, "Route not found");
    } catch (err) { if (!res.headersSent) json(err.status ?? 500, { error: err.status ? err.message : "Internal error" }); }
  });
  async function evaluateFleetAlerts() {
    const queued = store.transaction((s) => {
      const out = [];
      for (const a of Object.values(s.agents)) {
        if (a.revoked) continue;
        const receipts = Object.values(s.receipts).filter((r) => r.agentId === a.id).map((r) => r.receipt);
        const spent = spendSummary(receipts, now());
        const alerts = evaluateAlerts({ agentId: a.id, caps: a.policy.caps, spend: { day: spent.day.usd, month: spent.month.usd }, blockedReasons: receipts.filter((r) => Date.parse(r.ts) > now() - 3600_000).map((r) => r.reason), lastSeenMs: a.lastSeen, nowMs: now() });
        // A configured global alert channel is not an org recipient grant.
        // The caller must explicitly route each org's alerts.
        const keys = new Set(alerts.map((x) => x.key));
        for (const prior of Object.values(s.alerts).filter((x) => x.agentId === a.id && !keys.has(x.key))) prior.active = false;
        for (const alert of alerts) {
          const prior = s.alerts[alert.key];
          if (!prior?.active) {
            s.alerts[alert.key] = { ...alert, orgId: a.orgId, agentId: a.id, active: true, delivery: "pending" };
            out.push(s.alerts[alert.key]);
          } else if (prior.delivery !== "accepted") out.push(prior);
        }
      }
      return out;
    });
    for (const a of queued) {
      let result;
      try { result = deliverAlert ? await deliverAlert(a) : [{ status: "unconfigured" }]; }
      catch { result = [{ status: "failed" }]; }
      store.transaction((s) => {
        s.alerts[a.key].delivery = result.every((r) => r.status === "accepted") ? "accepted" : "failed";
        audit(s, a.orgId, "alert-worker", "alert.delivery", a.agentId, { kind: a.kind, result });
      });
    }
    return queued.length;
  }
  return { server, billingReady, evaluateFleetAlerts };
}
