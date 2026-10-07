import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scanText, scanTree } from "../scripts/security-scan.mjs";

test("security scan rejects secrets and unsafe sinks", () => {
  const bad = [
    "-----BEGIN " + "PRIVATE KEY-----\nabc",
    "AKIA" + "IOSFODNN7EXAMPLE",
    "xkeysib-" + "abcdefghijklmnop",
    "sk_live_" + "abcdefghijklmnop",
    "https://api." + "resend.com/emails",
    "eval" + "(",
    "inner" + "HTML",
  ];
  for (const sample of bad) assert.equal(scanText("fixture", sample).length > 0, true, sample.slice(0, 12));
  assert.equal(scanText("fixture", "billing is disabled").length, 0);
});

test("the tracked tree passes the security scan", () => {
  assert.deepEqual(scanTree(), []);
});

test("the hosted image does not run as root", () => {
  const docker = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  assert.match(docker, /^USER node$/m);
  assert.doesNotMatch(docker, /^USER root$/m);
});
