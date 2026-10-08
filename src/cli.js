#!/usr/bin/env node
// costcap CLI. `costcap wrap [--cap USD] [--day-cap USD] [--month-cap USD] [--receipts FILE] -- <command...>`
// starts the local metering proxy with a hard spend cap, points the wrapped
// process's provider base URLs at it, and exits with the child's exit code.
// Guardrails, not guarantees: only traffic through the proxy is metered.

import { checkBudget } from "./check.js";
import { reconcileFiles } from "./reconcile.js";
import { serveMcp } from "./mcp.js";
import { enroll, createFleetClient } from "./hosted/client.js";
import { resolvePolicy } from "./hosted/policy.js";
import { lockLedger } from "./ledger-lock.js";
import { spawn } from "node:child_process";
import { startMeteringProxy, baseUrlOverrides } from "./proxy.js";
import { createCapEngine, loadReceipts } from "./cap.js";
import { createVelocityBreaker } from "./velocity.js";
import { createKillCheck, kill, resume, DEFAULT_KILL_FILE } from "./kill.js";
import { VERSION } from "./version.js";

const USAGE = "usage: costcap wrap [--cap USD] [--day-cap USD] [--month-cap USD] [--max-steps N] [--velocity-multiple X] [--receipts FILE] [--enrollment FILE] [--kill-file FILE] -- <command...>\n" +
  "       costcap check [--cap USD] [--receipts FILE]\n" +
  "       costcap reconcile --receipts FILE --provider FILE\n" +
  "       costcap enroll --url URL --name NAME [--enrollment FILE]\n" +
  "       costcap mcp [--cap USD] [--receipts FILE]\n" +
  "       costcap kill [note] [--kill-file FILE] | costcap resume [--kill-file FILE]\n" +
  "       costcap --version | costcap --help";

export function parseWrapArgs(argv) {
  const sep = argv.indexOf("--");
  if (sep === -1 || sep === argv.length - 1) throw new Error("usage: costcap wrap [--cap USD] [--day-cap USD] [--month-cap USD] [--max-steps N] [--velocity-multiple X] [--receipts FILE] -- <command...>");
  const flags = argv.slice(0, sep);
  const command = argv.slice(sep + 1);
  const opts = { caps: {}, maxSteps: undefined, velocityMultiple: undefined, receiptsPath: ".costcap/receipts.jsonl", killFile: DEFAULT_KILL_FILE, command };
  const money = (name, v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number of USD, got "${v}"`);
    return n;
  };
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    const v = flags[++i];
    if (v === undefined) throw new Error(`${f} needs a value`);
    if (f === "--cap") opts.caps.run = money(f, v);
    else if (f === "--day-cap") opts.caps.day = money(f, v);
    else if (f === "--month-cap") opts.caps.month = money(f, v);
    else if (f === "--max-steps") {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) throw new Error(`--max-steps must be a positive integer, got "${v}"`);
      opts.maxSteps = n;
    } else if (f === "--velocity-multiple") {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 1) throw new Error(`--velocity-multiple must be a number greater than 1, got "${v}"`);
      opts.velocityMultiple = n;
    } else if (f === "--receipts") opts.receiptsPath = v;
    else if (f === "--enrollment") opts.enrollmentPath = v;
    else if (f === "--kill-file") opts.killFile = v;
    else throw new Error(`unknown flag ${f}`);
  }
  return opts;
}

export async function wrap(argv) {
  const { caps, maxSteps, velocityMultiple, receiptsPath, killFile, command, enrollmentPath } = parseWrapArgs(argv);
  const release = lockLedger(receiptsPath);
  try {
  const cap = createCapEngine({ caps, history: loadReceipts(receiptsPath) });
  let fleet;
  let fleetPolicy;
  const setPolicy = (p) => {
    fleetPolicy = p;
    cap.updateCaps(resolvePolicy({ local: caps, lastKnown: { version: p.version, caps: p.caps, killed: p.killed } }).caps);
  };
  if (enrollmentPath) {
    fleet = createFleetClient({ path: enrollmentPath, receiptsPath, onPolicy: setPolicy });
    setPolicy(fleet.policy());
    const result = await fleet.sync();
    if (!result.online) console.error("costcap: fleet offline; cached policy enforced");
  }
  const localKill = createKillCheck(killFile);
  const combinedKill = () => localKill() || (fleetPolicy?.killed || fleet?.revoked() ? { reason: "killed", note: "fleet policy or revoked credentials" } : null);
  const velocity = createVelocityBreaker({ maxSteps, ...(velocityMultiple ? { multiple: velocityMultiple } : {}) });
  const upstreams = process.env.COSTCAP_TEST_OPENAI_UPSTREAM ? { openai: process.env.COSTCAP_TEST_OPENAI_UPSTREAM } : undefined; // test hook
  const { server, port } = await startMeteringProxy({ receiptsPath, cap, upstreams, velocity, killCheck: combinedKill });
  const env = { ...process.env };
  for (const line of baseUrlOverrides(port)) {
    const [k, ...v] = line.split("=");
    env[k] = v.join("=");
  }
  const child = spawn(command[0], command.slice(1), { env, stdio: "inherit" });
  // Kill switch also stops the wrapped child: SIGTERM, then SIGKILL after 5s.
  const killCheck = combinedKill;
  const syncTimer = fleet ? setInterval(() => fleet.sync(), 60_000) : null;
  let killedByCostcap = false;
  const watcher = setInterval(() => {
    if (killedByCostcap || !killCheck()) return;
    killedByCostcap = true;
    console.error("costcap: kill file present, stopping wrapped process");
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5000).unref();
  }, Number(process.env.COSTCAP_KILL_POLL_MS) || 500);
  const code = await new Promise((resolve) => {
    child.on("exit", (c, sig) => resolve(killedByCostcap ? 143 : (c ?? (sig ? 1 : 0))));
    child.on("error", (e) => { console.error(`costcap: failed to start ${command[0]}: ${e.message}`); resolve(127); });
  });
  clearInterval(watcher);
  if (syncTimer) clearInterval(syncTimer);
  if (fleet) await fleet.sync();
  server.closeAllConnections();
  server.close();
  const s = cap.spend();
  console.error(`costcap: run spend $${s.run.toFixed(4)}${caps.run != null ? ` of $${caps.run} cap` : ""}`);
  return code;
  } finally { release(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    console.log(VERSION);
    process.exit(0);
  } else if (cmd === "--help" || cmd === "-h" || cmd === "help" || cmd === undefined) {
    console.log(USAGE);
    process.exit(0);
  } else if (cmd === "wrap") {
    wrap(rest).then((c) => process.exit(c), (e) => { console.error(`costcap: ${e.message}`); process.exit(2); });
  } else if (cmd === "check" || cmd === "mcp") {
    try {
      const parsed = parseWrapArgs([...rest, "--", "unused"]);
      const options = { receiptsPath: parsed.receiptsPath, caps: parsed.caps };
      if (cmd === "mcp") serveMcp(options);
      else {
        const result = checkBudget(options);
        console.log(JSON.stringify(result));
        process.exitCode = result.ok ? 0 : 1;
      }
    } catch (err) { console.error(`costcap: ${err.message}`); process.exitCode = 2; }
  } else if (cmd === "enroll") {
    const option = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
    enroll({ url: option("--url"), name: option("--name"), token: process.env.COSTCAP_ENROLL_TOKEN, path: option("--enrollment") ?? ".costcap/enrollment.json" })
      .then(({ agentId }) => console.error(`costcap: enrolled ${agentId}. Use --enrollment with wrap.`), (e) => { console.error(`costcap: ${e.message}`); process.exitCode = 2; });
  } else if (cmd === "reconcile") {
    try {
      const option = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
      const receiptsPath = option("--receipts");
      const providerPath = option("--provider");
      if (!receiptsPath || !providerPath) throw new Error("usage: costcap reconcile --receipts FILE --provider FILE");
      const result = reconcileFiles({ receiptsPath, providerPath });
      console.log(JSON.stringify(result));
      process.exitCode = result.ok ? 0 : 1;
    } catch (err) { console.error(`costcap: ${err.message}`); process.exitCode = 2; }
  } else if (cmd === "kill") {
    const i = rest.indexOf("--kill-file");
    const file = i >= 0 ? rest[i + 1] : DEFAULT_KILL_FILE;
    const skip = new Set(i >= 0 ? [i, i + 1] : []);
    kill(file, rest.filter((a, j) => !skip.has(j)).join(" "));
    console.error(`costcap: killed. Wrapped agents sharing ${file} are refused until \`costcap resume\`.`);
  } else if (cmd === "resume") {
    const i = rest.indexOf("--kill-file");
    const file = i >= 0 ? rest[i + 1] : DEFAULT_KILL_FILE;
    console.error(resume(file) ? "costcap: resumed." : "costcap: nothing to resume (not killed).");
  } else {
    console.error(`costcap: unknown command "${cmd}"\n${USAGE}`);
    process.exit(2);
  }
}
