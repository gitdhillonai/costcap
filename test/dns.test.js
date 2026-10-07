import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("dns workflow fails closed and does not call a provider", () => {
  const records = JSON.parse(readFileSync(new URL("../infra/dns/costcap.dev.json", import.meta.url), "utf8"));
  assert.equal(records.zone, "costcap.dev");
  assert.deepEqual(records.records.map((record) => record.name), ["@", "app"]);
  const marker = "not-a-real-dns-token";
  const missing = spawnSync(process.execPath, ["scripts/dns-preflight.mjs"], { encoding: "utf8", env: { ...process.env, COSTCAP_DNS_TOKEN: "" } });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /COSTCAP_DNS_TOKEN is missing/);
  const present = spawnSync(process.execPath, ["scripts/dns-preflight.mjs"], { encoding: "utf8", env: { ...process.env, COSTCAP_DNS_TOKEN: marker } });
  assert.equal(present.status, 2);
  assert.equal(present.stderr.includes(marker), false);
  assert.match(present.stderr, /no DNS API was called/);
  const script = readFileSync(new URL("../scripts/dns-preflight.mjs", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../.github/workflows/dns.yml", import.meta.url), "utf8");
  assert.equal(script.includes("fetch("), false);
  assert.equal(workflow.includes("curl"), false);
  assert.equal(workflow.includes("fetch("), false);
});
