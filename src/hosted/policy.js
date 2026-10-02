// Fleet policy for enrolled agents (story #13). Pure logic, no I/O, no web
// framework: the hosted service stores policies and enrollment tokens, the
// CLI uses resolvePolicy() to decide which caps apply.
//
// Offline rule: the CLI keeps the last policy it received. If the server is
// unreachable it keeps enforcing that policy (last-known). A policy only
// loosens when the server actually delivers a newer version.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Enrollment tokens are shown once. Only the SHA-256 hash is stored.
export function newEnrollmentToken() {
  const token = `cc_enr_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyToken(token, storedHash) {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash ?? "", "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const CAP_KEYS = ["run", "day", "month"];

export function validatePolicy(p) {
  const errors = [];
  if (!p || typeof p !== "object") return ["policy must be an object"];
  if (!Number.isInteger(p.version) || p.version < 1) errors.push("version must be a positive integer");
  for (const k of CAP_KEYS) {
    const v = p.caps?.[k];
    if (v !== undefined && !(typeof v === "number" && Number.isFinite(v) && v > 0)) errors.push(`caps.${k} must be a positive number`);
  }
  if (p.killed !== undefined && typeof p.killed !== "boolean") errors.push("killed must be boolean");
  return errors;
}

// Decide which policy the CLI enforces. `local` holds flags the user passed,
// `lastKnown` is the cached server policy (or null), `fetched` is the fresh
// server response (or null when offline/unreachable).
// Local flags can only tighten a fleet policy, never loosen it.
export function resolvePolicy({ local = {}, lastKnown = null, fetched = null }) {
  let server = lastKnown;
  let source = lastKnown ? "last-known" : "none";
  if (fetched && validatePolicy(fetched).length === 0 && (!lastKnown || fetched.version >= lastKnown.version)) {
    server = fetched;
    source = "server";
  }
  const caps = {};
  for (const k of CAP_KEYS) {
    const vals = [server?.caps?.[k], local?.[k]].filter((v) => v != null);
    if (vals.length) caps[k] = Math.min(...vals);
  }
  return { caps, killed: Boolean(server?.killed), version: server?.version ?? null, source };
}
