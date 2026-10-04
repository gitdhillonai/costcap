// One wrapped process per receipt ledger. Shared-file daily/monthly caps
// must not race across independent proxy processes.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { hostname } from "node:os";
export function lockLedger(path) {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (err) {
    if (err.code !== "EEXIST") throw err;
    // Never auto-delete an ambiguous lock or a lock on another host.
    let owner;
    try { owner = JSON.parse(readFileSync(`${lock}/owner.json`, "utf8")); } catch { /* fail closed */ }
    throw new Error(`Receipt ledger is locked${owner ? ` by PID ${owner.pid} on ${owner.host}` : ""}. Confirm the owner stopped before removing ${lock}.`);
  }
  try { writeFileSync(`${lock}/owner.json`, JSON.stringify({ pid: process.pid, host: hostname() }), { mode: 0o600 }); }
  catch (err) { rmSync(lock, { recursive: true, force: true }); throw err; }
  return () => rmSync(lock, { recursive: true, force: true });
}
