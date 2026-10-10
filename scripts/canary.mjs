// Checks a running CostCap origin. Prints statuses, not response bodies.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function load(fetchImpl, url, parse) {
  const res = await fetchImpl(url);
  if (!parse) return { status: res.status, body: null, transient: res.status === 502 || res.status === 503 };
  try {
    const body = typeof res.json === "function" ? await res.json() : null;
    return { status: res.status, body, transient: res.status === 502 || res.status === 503 };
  } catch {
    return { status: res.status, body: null, transient: true };
  }
}

async function stable(fetchImpl, url, parse) {
  let last;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    last = await load(fetchImpl, url, parse);
    if (!last.transient) return last;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return last;
}

export async function canary(base, fetchImpl = globalThis.fetch, expectedSha = "", expectedBilling = "disabled") {
  const root = String(base).replace(/\/$/, "");
  const healthRes = await stable(fetchImpl, `${root}/health`, true);
  const health = healthRes.body || {};
  const pageRes = await stable(fetchImpl, `${root}/`, false);
  const configRes = await stable(fetchImpl, `${root}/ui/config`, true);
  const config = configRes.body;
  const fleetRes = await stable(fetchImpl, `${root}/v1/fleet`, true);
  const errors = [];
  if (healthRes.status !== 200 || health.billing !== expectedBilling || health.persistence !== "single-process-file") errors.push("health");
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
  const result = await canary(base, globalThis.fetch, process.env.COSTCAP_EXPECT_SHA || "", process.env.COSTCAP_EXPECT_BILLING || "disabled");
  if (!result.ok) {
    console.error(`canary: failed ${result.errors.join(", ")}`);
    process.exit(1);
  }
  console.error("canary: passed");
}
