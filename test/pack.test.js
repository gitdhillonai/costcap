import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { reviewPack } from "../scripts/pack-check.mjs";

test("pack review allows the manifest, license, readme, and src only", () => {
  assert.deepEqual(reviewPack(["package.json", "README.md", "LICENSE", "src/cli.js"]), { missing: [], unexpected: [], hasSource: true });
  const bad = reviewPack(["package.json", "README.md", ".env", "test/pack.test.js"]);
  assert.equal(bad.missing.includes("LICENSE"), true);
  assert.equal(bad.unexpected.includes(".env"), true);
  assert.equal(bad.unexpected.includes("test/pack.test.js"), true);
});

test("the repository pack and the publish workflow do not publish", () => {
  const check = spawnSync(process.execPath, ["scripts/pack-check.mjs"], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  const marker = "not-a-real-npm-token";
  const missing = spawnSync(process.execPath, ["scripts/publish-preflight.mjs"], { encoding: "utf8", env: { ...process.env, NPM_TOKEN: "" } });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /NPM_TOKEN is missing/);
  const present = spawnSync(process.execPath, ["scripts/publish-preflight.mjs"], { encoding: "utf8", env: { ...process.env, NPM_TOKEN: marker } });
  assert.equal(present.status, 2);
  assert.equal(present.stderr.includes(marker), false);
  assert.match(present.stderr, /npm publish was not run/);
  const workflow = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
  assert.equal(workflow.includes("npm publish"), false);
  assert.match(workflow, /publish-preflight\.mjs/);
});
