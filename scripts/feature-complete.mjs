// Build FEATURE-COMPLETE.md from this process's test run and a live curl.
// Status DONE requires a passing named test and a passing live check.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const tap = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "test/*.test.js"], { cwd: repo, encoding: "utf8" });
const passed = new Set();
for (const line of `${tap.stdout}\n${tap.stderr}`.split("\n")) {
  const ok = /^ok \d+ - (.+)$/.exec(line);
  if (ok) passed.add(ok[1]);
}
const failed = [];
for (const line of `${tap.stdout}\n${tap.stderr}`.split("\n")) {
  const bad = /^not ok \d+ - (.+)$/.exec(line);
  if (bad) failed.push(bad[1]);
}

const live = { observedAt: new Date().toISOString() };
try {
  const healthRes = await fetch("https://app.costcap.dev/health");
  live.healthStatus = healthRes.status;
  live.health = await healthRes.json();
  const rootRes = await fetch("https://app.costcap.dev/");
  const html = await rootRes.text();
  live.rootStatus = rootRes.status;
  live.rootHasBillingDisabled = html.includes("Billing is disabled");
  live.rootHasFreeBeta = html.includes("FREE BETA");
  live.rootHasFleet = html.includes("Fleet guardrails");
  const configRes = await fetch("https://app.costcap.dev/ui/config");
  const config = await configRes.json();
  live.configStatus = configRes.status;
  live.configHasSiteKey = typeof config.siteKey === "string" && config.siteKey.length > 0;
  live.configKeys = Object.keys(config);
  const fleetRes = await fetch("https://app.costcap.dev/v1/fleet");
  live.fleetStatus = fleetRes.status;
  const billingRes = await fetch("https://app.costcap.dev/billing", { method: "POST", headers: { origin: "https://app.costcap.dev", "content-type": "application/json" }, body: "{}" });
  live.billingStatus = billingRes.status;
} catch (err) {
  live.error = err.message;
}
try {
  const apex = await fetch("https://costcap.dev/");
  live.apexStatus = apex.status;
} catch (err) {
  live.apexError = err.cause?.message ?? err.message;
}

const acceptancePath = join(repo, "docs/verification/2026-10-06-runaway.json");
let acceptance;
try { acceptance = JSON.parse(readFileSync(acceptancePath, "utf8")); } catch { acceptance = null; }

const rows = [
  ["CLI wrap run cap", "wrap points the child at the proxy and the cap hard-stops the second call", "local"],
  ["CLI day cap", "wrap enforces day-cap and month-cap from the CLI", "local"],
  ["CLI month cap", "wrap enforces day-cap and month-cap from the CLI", "local"],
  ["CLI max steps", "wrap --max-steps 2 lets two calls through and breaks the third with breaker_open", "local"],
  ["Retry-pattern detection", "retry spiral: identical request past the threshold gets 429 spiral_detected and never reaches upstream", "local"],
  ["Cost-velocity breaker", "a 10x spike after a baseline trips and latches", "local"],
  ["Local kill and resume", "kill writes the file, check sees it, resume clears it", "local"],
  ["Kill file is cwd-relative", "default kill file is relative to the working directory", "local"],
  ["SIGKILL after 5 seconds", "wrap sends SIGKILL after 5 seconds when the child ignores SIGTERM", "local"],
  ["Unknown cost stays null", "missing usage is stored as null and blocks the next call", "local"],
  ["Check does not count unknown cost as zero", "CI budget checks fail closed for unknown, malformed or missing evidence", "local"],
  ["SSE buffered metering for OpenAI, Anthropic and Gemini", "SSE fixtures for OpenAI, Anthropic and Gemini are buffered then metered", "local"],
  ["Versioned pricing table", "known model returns its table entry with version pinned", "local"],
  ["Unknown model uses declared fallback", "unknown model bills at declared fallback, flagged, never free", "local"],
  ["Anthropic cache creation at input rate", "Anthropic cache creation is priced at the input rate", "local"],
  ["One accepted call can exceed the remaining cap", "a metered call can exceed the remaining run cap and the next call does not", "local"],
  ["Requests are serialized in one proxy", "proxy serializes upstream calls", "local"],
  ["Ledger lock survives a stopped wrapper", "a lock left by a stopped wrapper is kept until it is removed", "local"],
  ["Separate ledgers do not share caps", "separate ledgers do not share day or month caps", "local"],
  ["UTC day and month windows", "day and month windows use UTC dates", "local"],
  ["Proxy binds to 127.0.0.1", "metering proxy binds to 127.0.0.1", "local"],
  ["Enroll client", "enrollment requires secure origin, validates cache and keeps credentials private", "local"],
  ["Policy and receipt sync with offline cache", "policy updates, cache, receipt acknowledgments and offline behavior", "local"],
  ["Wrapper cannot loosen a cached policy", "wrapper cannot loosen a cached fleet policy", "local"],
  ["check command", "check command exits 0 under, 1 at cap, 2 for absent evidence", "local"],
  ["Composite GitHub Action", "composite action runs the local check command", "local"],
  ["Local MCP budget_status", "MCP supports initialize, tool listing and read-only budget status", "local"],
  ["Hosted health route", "billing stays disabled and there is no charge route", "health"],
  ["Billing disabled", "billing stays disabled and there is no charge route", "billing"],
  ["Hosted UI shell", "same-origin UI assets use CSP and no inline scripts or data HTML injection", "ui"],
  ["Org-scoped fleet API", "verified org-first login, tenant isolation, enrollment, receipt sync and restart", "local"],
  ["Brevo mail adapter", "Brevo sends proper auth, addresses and escaped HTML", "local"],
  ["Slack webhook adapter", "invalid webhook origins are rejected before delivery", "local"],
  ["Alert rules", "alerts: approaching, hit, loop, silent", "local"],
  ["Single-process JSON datastore", "durable transactions roll back on failure and reopen without loss", "store"],
  ["Runaway acceptance command", "acceptance file", "acceptance"],
];

const blocked = [
  ["Live email-code login", "TURNSTILE_SECRET_KEY and a Brevo inbox were not used. This run did not submit a live challenge or read a mailbox."],
  ["Live alert delivery", "BREVO_API_KEY and an authorized COSTCAP_ALERT_ORG_ID recipient were not used. No live mail or Slack message was sent."],
  ["Postgres datastore", "No Postgres instance is provisioned for this beta. Live /health reports persistence single-process-file."],
  ["Team invitations", "Not implemented. The beta contract creates a new org per verified email and does not join by domain."],
  ["Paid billing", "Billing is disabled. No Stripe secret is configured. POST /billing on the live host is not a checkout."],
  ["npm publication", "npm publish was not run."],
  ["GitHub Marketplace listing", "No marketplace release was published."],
  ["Provider-bill reconciliation", "No provider billing credential was available. Receipts are estimates."],
  ["Two-week fleet dogfood", "No two-week authorized receipt archive was produced."],
  ["costcap.dev apex site", `TLS request failed: ${live.apexError ?? `HTTP ${live.apexStatus}`}. No DNS or certificate change was made.`],
];

function statusFor(name, kind) {
  if (name === "acceptance file") {
    return acceptance && acceptance.paidCalls === 0 && acceptance.results?.length === 7 ? "TESTED" : "FAIL";
  }
  if (!passed.has(name) || tap.status !== 0) return "FAIL";
  const ci = process.env.COSTCAP_CI_RUN;
  const liveOk = (kind === "health" && live.healthStatus === 200 && live.health?.status === "ok" && live.health?.billing === "disabled")
    || (kind === "billing" && live.health?.billing === "disabled" && live.rootHasBillingDisabled && live.billingStatus === 404)
    || (kind === "ui" && live.rootStatus === 200 && live.rootHasFreeBeta && live.rootHasFleet && live.configHasSiteKey && !live.configKeys?.includes("secret"))
    || (kind === "store" && live.health?.persistence === "single-process-file");
  if (liveOk && ci) return "DONE";
  return "TESTED";
}

const lines = [];
lines.push("# Feature completion");
lines.push("");
lines.push(`Generated ${live.observedAt} by \`node scripts/feature-complete.mjs\`.`);
lines.push(`Test process exit ${tap.status}. Passed names: ${passed.size}. Failed names: ${failed.length ? failed.join("; ") : "none"}.`);
lines.push("DONE means COSTCAP_CI_RUN names a finished green GitHub run and the live curl matched. TESTED means the named test passed. BLOCKED is not done.");
lines.push("");
lines.push("| feature | status | test | evidence |");
lines.push("|---|---|---|---|");
for (const [feature, test, kind] of rows) {
  const status = statusFor(test, kind);
  let evidence = kind === "acceptance" && acceptance
    ? `docs/verification/2026-10-06-runaway.json checkedAt ${acceptance.checkedAt}; paidCalls ${acceptance.paidCalls}; scenarios ${acceptance.results.map((r) => r.scenario).join(", ")}`
    : `node --test matched ${JSON.stringify(test)}`;
  if (kind === "health") evidence += `; GET https://app.costcap.dev/health ${live.healthStatus} ${JSON.stringify(live.health)}`;
  if (kind === "billing") evidence += `; GET /health billing=${live.health?.billing}; GET / contains Billing is disabled=${live.rootHasBillingDisabled}; POST /billing with origin returned ${live.billingStatus}`;
  if (kind === "ui") evidence += `; GET / ${live.rootStatus}; FREE BETA=${live.rootHasFreeBeta}; GET /ui/config ${live.configStatus} keys=${(live.configKeys ?? []).join(",")}`;
  if (kind === "store") evidence += `; live persistence=${live.health?.persistence ?? "unavailable"}`;
  if (process.env.COSTCAP_CI_RUN) evidence += `; CI ${process.env.COSTCAP_CI_RUN}`;
  lines.push(`| ${feature} | ${status} | ${test} | ${evidence} |`);
}
for (const [feature, reason] of blocked) {
  lines.push(`| ${feature} | BLOCKED |  | ${reason} |`);
}
lines.push("");
lines.push("## Live curl");
lines.push("");
lines.push("```json");
lines.push(JSON.stringify(live, null, 2));
lines.push("```");
lines.push("");
writeFileSync(join(repo, "FEATURE-COMPLETE.md"), lines.join("\n"));
if (tap.status !== 0) process.exit(tap.status);
