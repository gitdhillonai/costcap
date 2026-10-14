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
  const orgA = "11111111-1111-4111-8111-111111111111";
  const orgB = "22222222-2222-4222-8222-222222222222";
  const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  psql(container, `
    INSERT INTO orgs (id, name) VALUES ('${orgA}', 'A'), ('${orgB}', 'B');
    INSERT INTO users (id, org_id, email, role) VALUES
      ('${userA}', '${orgA}', 'a@example.test', 'owner'),
      ('${userB}', '${orgB}', 'b@example.test', 'owner');
  `);
  const asApp = (orgId, sql) => psql(container, `
    SET ROLE costcap_app;
    ${orgId ? `SET app.org_id = '${orgId}';` : "RESET app.org_id;"}
    ${sql}
  `).split("\n").map((line) => line.trim()).filter((line) => line && line !== "SET" && line !== "RESET");
  assert.deepEqual(asApp(orgA, "SELECT id FROM orgs ORDER BY id;"), [orgA]);
  assert.deepEqual(asApp(orgA, "SELECT id FROM users ORDER BY id;"), [userA]);
  assert.deepEqual(asApp(orgA, `UPDATE orgs SET name = 'hacked' WHERE id = '${orgB}';`), ["UPDATE 0"]);
  assert.deepEqual(asApp(orgA, `DELETE FROM users WHERE id = '${userB}';`), ["DELETE 0"]);
  assert.throws(() => asApp(orgA, `INSERT INTO orgs (id, name) VALUES ('${orgB}', 'stolen');`));
  assert.throws(() => asApp(orgA, `UPDATE users SET org_id = '${orgB}' WHERE id = '${userA}';`));
  const unset = (sql) => psql(container, `SET ROLE costcap_app;\n${sql}`).split("\n").map((line) => line.trim()).filter((line) => line && line !== "SET");
  assert.deepEqual(unset("SELECT count(*) FROM orgs;"), ["0"]);
  assert.deepEqual(unset("SELECT count(*) FROM users;"), ["0"]);
  assert.equal(psql(container, "SELECT name FROM orgs WHERE id = '" + orgB + "';").trim(), "B");
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
