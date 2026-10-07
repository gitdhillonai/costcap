import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const required = ["COSTCAP_ORIGIN", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "BREVO_API_KEY", "COSTCAP_EMAIL_FROM"];

function env(values = {}) {
  const next = { ...process.env, COMPOSE_DISABLE_ENV_FILE: "1" };
  for (const key of required) delete next[key];
  return { ...next, ...values };
}

function compose(values) {
  return spawnSync("docker", ["compose", "config"], { cwd: repo, env: env(values), encoding: "utf8" });
}

test("compose config fails closed without required variables", () => {
  const result = compose();
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}`, /required variable (?:COSTCAP_ORIGIN|TURNSTILE_SITE_KEY|TURNSTILE_SECRET_KEY|BREVO_API_KEY|COSTCAP_EMAIL_FROM)/);
});

test("compose config renders one replica and a data volume for uid 1000", () => {
  const marker = "not-a-real-mail-marker";
  const result = compose({
    COSTCAP_ORIGIN: "https://app.example.invalid",
    TURNSTILE_SITE_KEY: "public-placeholder",
    TURNSTILE_SECRET_KEY: "secret-placeholder",
    BREVO_API_KEY: marker,
    COSTCAP_EMAIL_FROM: "noreply@example.invalid",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /user: 1000:1000/);
  assert.match(result.stdout, /replicas: 1/);
  assert.match(result.stdout, /target: \/data/);
  assert.doesNotMatch(result.stdout, /replicas: [2-9]/);
  const serviceBlock = result.stdout.split(/^networks:/m)[0];
  assert.deepEqual(serviceBlock.match(/^  [a-z0-9-]+:$/gm), ["  costcap:"]);
});

test("deploy preflight reports missing names and does not print values", () => {
  const marker = "not-a-real-mail-marker";
  const missing = spawnSync(process.execPath, ["scripts/deploy-preflight.mjs"], { cwd: repo, env: env(), encoding: "utf8" });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /COSTCAP_ORIGIN/);
  const ready = spawnSync(process.execPath, ["scripts/deploy-preflight.mjs"], {
    cwd: repo,
    env: env({
      COSTCAP_ORIGIN: "https://app.example.invalid",
      TURNSTILE_SITE_KEY: "public-placeholder",
      TURNSTILE_SECRET_KEY: marker,
      BREVO_API_KEY: marker,
      COSTCAP_EMAIL_FROM: "noreply@example.invalid",
    }),
    encoding: "utf8",
  });
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(ready.stderr.includes(marker), false);
  assert.match(ready.stderr, /apply was not run/);
  const apply = spawnSync(process.execPath, ["scripts/deploy-apply.mjs"], { cwd: repo, env: env({ COSTCAP_DEPLOY_HOST: "root@example" }), encoding: "utf8" });
  assert.equal(apply.status, 2);
  assert.match(apply.stderr, /apply was not run/);
  const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /deploy-preflight\.mjs/);
  assert.match(workflow, /deploy-apply\.mjs/);
  assert.equal(workflow.includes("ssh"), false);
});
