import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostedServer } from "../src/hosted/server.js";
import { applyFile, psql } from "../scripts/db-migrate.mjs";

const root = new URL("..", import.meta.url);
const file = (name) => new URL(name, root);

test("postgres migrations apply and roll back without changing the running store", async (t) => {
  const container = `cc-pg-${process.pid}`;
  const started = spawnSync("docker", ["run", "-d", "--rm", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"], { encoding: "utf8" });
  assert.equal(started.status, 0, started.stderr);
  t.after(() => spawnSync("docker", ["rm", "-f", container]));
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = spawnSync("docker", ["logs", container], { encoding: "utf8" });
    const boots = `${logs.stdout}\n${logs.stderr}`.split("ready to accept connections").length - 1;
    if (boots >= 2) {
      try {
        if (psql(container, "SELECT 1;").trim() === "1") { ready = true; break; }
      } catch { /* the final server is still opening its socket */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, "postgres did not finish its restart");
  applyFile(container, file("db/migrations/000_roles.sql"));
  psql(container, `BEGIN;\n${readFileSync(file("db/migrations/001_init.sql"))}\n${readFileSync(file("db/migrations/002_grants.sql"))}\nROLLBACK;`);
  assert.equal(psql(container, "SELECT to_regclass('public.orgs');").trim(), "");
  applyFile(container, file("db/migrations/001_init.sql"));
  applyFile(container, file("db/migrations/002_grants.sql"));
  assert.equal(psql(container, "SELECT r.rolname FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE c.relname = 'orgs';").trim(), "costcap_migrate");
  assert.equal(psql(container, "SELECT has_schema_privilege('costcap_app', 'public', 'CREATE');").trim(), "f");
  assert.equal(psql(container, "SELECT has_table_privilege('costcap_app', 'orgs', 'INSERT');").trim(), "t");
  applyFile(container, file("db/migrations/001_init.down.sql"));
  assert.equal(psql(container, "SELECT to_regclass('public.orgs');").trim(), "");
  assert.equal(readFileSync(file("src/hosted/run.js"), "utf8").includes("DATABASE_URL"), false);
  const service = createHostedServer({
    storePath: join(mkdtempSync(join(tmpdir(), "cc-health-")), "store.json"),
    origin: "http://localhost",
    secureCookies: false,
    verifyChallenge: async () => false,
    sendCode: async () => {},
  });
  t.after(() => { service.server.closeAllConnections(); service.server.close(); });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const health = await fetch(`http://127.0.0.1:${service.server.address().port}/health`);
  assert.equal((await health.json()).persistence, "single-process-file");
});
