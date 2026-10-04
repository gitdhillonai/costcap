// Single-process durable beta datastore. Never run multiple replicas against it.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
export function openStore(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { version: 1, orgs: {}, users: {}, sessions: {}, challenges: {}, enrollments: {}, agents: {}, receipts: {}, audit: [], alerts: {} };
  if (state.version !== 1) throw new Error("Unknown store version");
  if (existsSync(path)) chmodSync(path, 0o600);
  let busy = false;
  return {
    read(fn) { return fn(structuredClone(state)); },
    transaction(fn) {
      if (busy) throw new Error("Nested transactions are refused");
      busy = true;
      try {
        const next = structuredClone(state);
        const result = fn(next);
        if (result?.then) throw new Error("Transactions must be synchronous");
        const temporary = `${path}.${randomUUID()}.tmp`;
        writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flush: true });
        renameSync(temporary, path);
        state = next;
        return result;
      } finally { busy = false; }
    },
  };
}
