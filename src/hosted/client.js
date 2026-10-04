// Enrolled-agent transport. Credentials/cache stay local, mode 0600.
// This client needs a real authenticated service; it does not create one.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { validatePolicy, resolvePolicy } from "./policy.js";
import { loadReceipts } from "../cap.js";

export function serviceUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error("Service URL must not contain credentials/query/fragment");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) throw new Error("Enrollment requires HTTPS (HTTP allowed only for loopback tests)");
  return url.href.replace(/\/$/, "");
}

export function saveEnrollment(path, data) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}

export function loadEnrollment(path) {
  if (!existsSync(path)) throw new Error("Enrollment not found. Use costcap enroll first.");
  const data = JSON.parse(readFileSync(path, "utf8"));
  serviceUrl(data.url);
  if (!data.token || !data.agentId || validatePolicy(data.policy).length) throw new Error("Invalid enrollment cache; refusing to run");
  return data;
}

async function request(url, token, path, body) {
  const response = await fetch(`${serviceUrl(url)}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000), redirect: "error",
  });
  if (!response.ok) throw new Error(`Fleet service returned HTTP ${response.status}`);
  return response.json();
}

export async function enroll({ url, token, name, path }) {
  if (!token || !name) throw new Error("Enrollment token and agent name are required");
  const result = await request(url, token, "/v1/enroll", { name });
  if (typeof result.agentId !== "string" || typeof result.token !== "string" || validatePolicy(result.policy).length) throw new Error("Invalid enrollment response");
  const data = { url: serviceUrl(url), token: result.token, agentId: result.agentId, policy: result.policy, syncedIds: [] };
  saveEnrollment(path, data);
  return { agentId: data.agentId };
}

export function createFleetClient({ path, receiptsPath, onPolicy = () => {} }) {
  let data = loadEnrollment(path);
  let revoked = false;
  let busy = false;
  const policy = () => resolvePolicy({ lastKnown: data.policy });
  return {
    policy,
    revoked: () => revoked,
    async sync() {
      if (busy) return { skipped: true };
      busy = true;
      try {
        const fetched = await request(data.url, data.token, "/v1/policy");
        if (validatePolicy(fetched).length) throw new Error("Invalid fleet policy response");
        // Only strictly newer valid versions can replace a cached policy.
        if (fetched.version > data.policy.version) {
          data.policy = fetched;
          saveEnrollment(path, data);
          onPolicy(policy());
        }
        const synced = new Set(data.syncedIds ?? []);
        const pending = loadReceipts(receiptsPath).filter((r) => r.id && !synced.has(r.id)).slice(0, 100);
        if (pending.length) {
          const result = await request(data.url, data.token, "/v1/receipts", { receipts: pending });
          const ids = new Set(pending.map((r) => r.id));
          if (!Array.isArray(result.acceptedIds) || result.acceptedIds.some((id) => !ids.has(id))) throw new Error("Invalid receipt acknowledgment");
          for (const id of result.acceptedIds) synced.add(id);
          data.syncedIds = [...synced];
          saveEnrollment(path, data);
        }
        return { online: true, version: data.policy.version };
      } catch (err) {
        // Revoked credentials cannot keep an agent running as if merely offline.
        if (/HTTP (401|403)/.test(err.message)) revoked = true;
        return { online: false, revoked, version: data.policy.version, error: err.message };
      } finally { busy = false; }
    },
  };
}
