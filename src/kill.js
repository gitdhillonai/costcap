// Kill switch: a kill file freezes every wrapped agent that shares it.
// While the file exists the proxy refuses all upstream calls (429 killed).
// `costcap kill` writes it, `costcap resume` removes it. Touching the file
// by hand works too. Local enforcement only: traffic outside the proxy is
// not stopped.

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_KILL_FILE = ".costcap/KILL";

export function createKillCheck(killFile = DEFAULT_KILL_FILE) {
  return () => {
    if (!existsSync(killFile)) return null;
    let reason = "";
    try { reason = readFileSync(killFile, "utf8").trim(); } catch { /* unreadable: still killed */ }
    return { reason: "killed", kill_file: killFile, note: reason || undefined };
  };
}

export function kill(killFile = DEFAULT_KILL_FILE, note = "") {
  mkdirSync(dirname(killFile), { recursive: true });
  writeFileSync(killFile, note ? `${note}\n` : "");
  return killFile;
}

// Returns true if the file existed.
export function resume(killFile = DEFAULT_KILL_FILE) {
  const had = existsSync(killFile);
  rmSync(killFile, { force: true });
  return had;
}
