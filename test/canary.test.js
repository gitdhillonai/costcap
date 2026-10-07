import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostedServer } from "../src/hosted/server.js";
import { canary } from "../scripts/canary.mjs";

test("canary passes on the real server and rejects a billing change", async (t) => {
  const service = createHostedServer({
    storePath: join(mkdtempSync(join(tmpdir(), "cc-canary-")), "store.json"),
    origin: "http://localhost",
    secureCookies: false,
    turnstileSiteKey: "fixture-public-key",
    verifyChallenge: async () => false,
    sendCode: async () => {},
  });
  t.after(() => { service.server.closeAllConnections(); service.server.close(); });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const run = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/canary.mjs", base]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (status) => resolve({ status, stderr }));
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /canary: passed/);
  const bad = await canary("http://example.invalid", async (url) => {
    if (url.endsWith("/health")) return { status: 200, json: async () => ({ billing: "enabled", persistence: "single-process-file" }) };
    if (url.endsWith("/ui/config")) return { status: 200, json: async () => ({ siteKey: "public" }) };
    if (url.endsWith("/v1/fleet")) return { status: 401, json: async () => ({}) };
    return { status: 200, json: async () => ({}), text: async () => "CostCap" };
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.errors, ["health"]);
  const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const applyAt = workflow.indexOf("deploy-apply.mjs");
  const canaryAt = workflow.indexOf("scripts/canary.mjs");
  assert.equal(applyAt > 0 && canaryAt > applyAt, true);
  assert.match(workflow, /if: success\(\)/);
});
