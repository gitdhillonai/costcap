#!/usr/bin/env node
// costcap CLI. `costcap wrap [--cap USD] [--day-cap USD] [--month-cap USD] [--receipts FILE] -- <command...>`
// starts the local metering proxy with a hard spend cap, points the wrapped
// process's provider base URLs at it, and exits with the child's exit code.
// Guardrails, not guarantees: only traffic through the proxy is metered.

import { spawn } from "node:child_process";
import { startMeteringProxy, baseUrlOverrides } from "./proxy.js";
import { createCapEngine, loadReceipts } from "./cap.js";

export function parseWrapArgs(argv) {
  const sep = argv.indexOf("--");
  if (sep === -1 || sep === argv.length - 1) throw new Error("usage: costcap wrap [--cap USD] [--day-cap USD] [--month-cap USD] [--receipts FILE] -- <command...>");
  const flags = argv.slice(0, sep);
  const command = argv.slice(sep + 1);
  const opts = { caps: {}, receiptsPath: ".costcap/receipts.jsonl", command };
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
    else if (f === "--receipts") opts.receiptsPath = v;
    else throw new Error(`unknown flag ${f}`);
  }
  return opts;
}

export async function wrap(argv) {
  const { caps, receiptsPath, command } = parseWrapArgs(argv);
  const cap = createCapEngine({ caps, history: loadReceipts(receiptsPath) });
  const upstreams = process.env.COSTCAP_TEST_OPENAI_UPSTREAM ? { openai: process.env.COSTCAP_TEST_OPENAI_UPSTREAM } : undefined; // test hook
  const { server, port } = await startMeteringProxy({ receiptsPath, cap, upstreams });
  const env = { ...process.env };
  for (const line of baseUrlOverrides(port)) {
    const [k, ...v] = line.split("=");
    env[k] = v.join("=");
  }
  const child = spawn(command[0], command.slice(1), { env, stdio: "inherit" });
  const code = await new Promise((resolve) => {
    child.on("exit", (c, sig) => resolve(c ?? (sig ? 1 : 0)));
    child.on("error", (e) => { console.error(`costcap: failed to start ${command[0]}: ${e.message}`); resolve(127); });
  });
  server.close();
  const s = cap.spend();
  console.error(`costcap: run spend $${s.run.toFixed(4)}${caps.run != null ? ` of $${caps.run} cap` : ""}`);
  return code;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "wrap") {
    wrap(rest).then((c) => process.exit(c), (e) => { console.error(`costcap: ${e.message}`); process.exit(2); });
  } else {
    console.error("usage: costcap wrap [--cap USD] -- <command...>");
    process.exit(2);
  }
}
