import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockLedger } from "../src/ledger-lock.js";

test("shared ledgers cannot be wrapped by two proxy processes", () => {
  const path = join(mkdtempSync(join(tmpdir(), "cc-lock-")), "ledger");
  const release = lockLedger(path);
  assert.throws(() => lockLedger(path), /locked/);
  release();
  lockLedger(path)();
});
