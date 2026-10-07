// Checks a running CostCap origin. Prints statuses, not response bodies.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function canary(base, fetchImpl = globalThis.fetch, expectedSha = "") {
  const root = String(base).replace(/\/$/, "");
  const healthRes = await fetchImpl(`${root}/health`);
  const health = await healthRes.json();
  const pageRes = await fetchImpl(`${root}/`);
  const configRes = await fetchImpl(`${root}/ui/config`);
  const config = await configRes.json();
  const fleetRes = await fetchImpl(`${root}/v1/fleet`);
  const errors = [];
  if (healthRes.status !== 200 || health.billing !== "disabled" || health.persistence !== "single-process-file") errors.push("health");
  if (expectedSha && health.sha !== expectedSha) errors.push("sha");
  if (pageRes.status !== 200) errors.push("ui");
  const keys = config && typeof config === "object" ? Object.keys(config) : [];
  if (configRes.status !== 200 || keys.length !== 1 || keys[0] !== "siteKey" || typeof config.siteKey !== "string" || config.siteKey.length === 0) errors.push("config");
  if (fleetRes.status !== 401) errors.push("fleet");
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const base = process.argv[2];
  if (!base) {
    console.error("canary: base URL required");
    process.exit(2);
  }
  const result = await canary(base, globalThis.fetch, process.env.COSTCAP_EXPECT_SHA || "");
  if (!result.ok) {
    console.error(`canary: failed ${result.errors.join(", ")}`);
    process.exit(1);
  }
  console.error("canary: passed");
}
