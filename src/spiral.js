// Retry-spiral detector: flags repeated near-identical requests inside a
// sliding window. Pure module, no I/O. A request is fingerprinted from
// method, path and a normalised body (whitespace collapsed, volatile keys
// dropped), so retries with a new request id still match.

import { createHash } from "node:crypto";

const VOLATILE = new Set(["request_id", "user", "metadata", "stream_options", "seed"]);

function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).filter((k) => !VOLATILE.has(k)).sort().map((k) => [k, normalise(value[k])]),
    );
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  return value;
}

export function fingerprint(method, path, bodyText) {
  let body = bodyText;
  try { body = JSON.stringify(normalise(JSON.parse(bodyText))); } catch { /* non-JSON body: use raw */ }
  return createHash("sha256").update(`${method} ${path}\n${body}`).digest("hex").slice(0, 16);
}

// threshold: identical requests allowed inside windowMs before it trips.
export function createSpiralDetector({ threshold = 5, windowMs = 60_000, now = () => Date.now() } = {}) {
  const seen = new Map(); // fingerprint -> timestamps[]
  return {
    // Returns null, or { fingerprint, count, windowMs } once the request is
    // the (threshold+1)th identical one in the window.
    observe(method, path, bodyText) {
      const fp = fingerprint(method, path, bodyText);
      const t = now();
      const times = (seen.get(fp) ?? []).filter((x) => t - x <= windowMs);
      times.push(t);
      seen.set(fp, times);
      if (times.length > threshold) return { fingerprint: fp, count: times.length, windowMs };
      return null;
    },
    reset() { seen.clear(); },
  };
}
