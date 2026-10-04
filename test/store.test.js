import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/hosted/store.js";
test("durable transactions roll back on failure and reopen without loss", () => {
  const p = join(mkdtempSync(join(tmpdir(), "cc-store-")), "state.json");
  const s = openStore(p);
  s.transaction((data) => { data.orgs.one = { name: "test" }; });
  assert.throws(() => s.transaction((data) => { data.orgs.two = {}; throw new Error("rollback"); }));
  assert.equal(openStore(p).read((data) => data.orgs.two), undefined);
  assert.equal(openStore(p).read((data) => data.orgs.one.name), "test");
  assert.equal(statSync(p).mode & 0o777, 0o600);
});
test("invalid persisted datastore is not silently replaced", () => {
  const p = join(mkdtempSync(join(tmpdir(), "cc-store-")), "state.json");
  writeFileSync(p, '{"version":99}');
  assert.throws(() => openStore(p), /Unknown/);
  writeFileSync(p, 'broken');
  assert.throws(() => openStore(p));
});
