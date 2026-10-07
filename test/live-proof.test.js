import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("live proof exits without sending mail or printing secrets", () => {
  const marker = "not-a-real-live-secret";
  const missing = spawnSync(process.execPath, ["scripts/live-proof.mjs"], { encoding: "utf8", env: { ...process.env, TURNSTILE_SECRET_KEY: "", BREVO_API_KEY: "", COSTCAP_ALERT_ORG_ID: "" } });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /TURNSTILE_SECRET_KEY/);
  assert.match(missing.stderr, /no mail was sent/);
  const present = spawnSync(process.execPath, ["scripts/live-proof.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      TURNSTILE_SECRET_KEY: marker,
      BREVO_API_KEY: marker,
      COSTCAP_ALERT_ORG_ID: "org-placeholder",
    },
  });
  assert.equal(present.status, 2);
  assert.equal(present.stderr.includes(marker), false);
  assert.match(present.stderr, /no mail was sent/);
  const script = readFileSync(new URL("../scripts/live-proof.mjs", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../.github/workflows/live-proof.yml", import.meta.url), "utf8");
  assert.equal(script.includes("fetch("), false);
  assert.equal(script.includes("api.brevo.com"), false);
  assert.equal(workflow.includes("curl"), false);
});
