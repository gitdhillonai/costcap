// Fails the build when tracked text contains a secret or an unsafe sink.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RULES = [
  { name: "private-key", re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "brevo-key", re: /xkeysib-[A-Za-z0-9]{16,}/ },
  { name: "stripe-live-key", re: /sk_live_[A-Za-z0-9]+/ },
  { name: "resend-endpoint", re: /https:\/\/api\.resend\.com/ },
  { name: "eval-call", re: /\beval\s*\(/ },
  { name: "html-sink", re: new RegExp("inner" + "HTML") },
];

export function scanText(name, text) {
  const findings = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    if (rule.re.test(text)) findings.push({ file: name, rule: rule.name });
  }
  return findings;
}

export function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
}

export function scanTree(files = trackedFiles(), read = (file) => readFileSync(file, "utf8")) {
  const findings = [];
  for (const file of files) {
    if (/\.(png|jpg|jpeg|gif|webp|ico|pdf|woff2?)$/i.test(file)) continue;
    let text;
    try { text = read(file); } catch { continue; }
    if (text.includes("\0")) continue;
    findings.push(...scanText(file, text));
  }
  return findings;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const findings = scanTree();
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.file}: ${finding.rule}`);
    process.exit(1);
  }
  console.error(`security-scan: ${trackedFiles().length} tracked files, no findings`);
}
