// Applies one replica when the deploy key, host, and commit are present. Otherwise it exits 2.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/;
const HOST_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/;

export function applyDeploy({ host = "", key = "", sha = "", cwd = process.cwd(), run = execFileSync } = {}) {
  if (!host || !key || !SHA_RE.test(sha)) {
    console.error("deploy: apply was not run; COSTCAP_DEPLOY_HOST, COSTCAP_DEPLOY_SSH_KEY, or COSTCAP_GIT_SHA is missing");
    return 2;
  }
  if (!HOST_RE.test(host)) {
    console.error("deploy: apply was not run; COSTCAP_DEPLOY_HOST is not a user@host");
    return 2;
  }
  const dir = mkdtempSync(join(tmpdir(), "costcap-deploy-"));
  const keyPath = join(dir, "id");
  try {
    writeFileSync(keyPath, key.endsWith("\n") ? key : `${key}\n`, { mode: 0o600 });
    chmodSync(keyPath, 0o600);
    const ssh = ["-i", keyPath, "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=20"];
    const knownHosts = resolve(cwd, "infra/ssh/costcap-deploy.known_hosts");
    if (existsSync(knownHosts)) ssh.push("-o", `UserKnownHostsFile=${knownHosts}`, "-o", "StrictHostKeyChecking=yes");
    const archive = run("tar", ["-czf", "-", "--exclude", "node_modules", "--exclude", ".git", "--exclude", ".env", "-C", cwd, "."], { maxBuffer: 64 * 1024 * 1024 });
    run("ssh", [...ssh, host, "rm -rf /opt/costcap/src && mkdir -p /opt/costcap/src && tar -xzf - -C /opt/costcap/src"], { input: archive });
    run("ssh", [...ssh, host, `sh /opt/costcap/src/scripts/deploy-remote.sh ${sha}`]);
    console.error("deploy: apply finished");
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(applyDeploy({
    host: process.env.COSTCAP_DEPLOY_HOST || "",
    key: process.env.COSTCAP_DEPLOY_SSH_KEY || "",
    sha: process.env.COSTCAP_GIT_SHA || "",
  }));
}
