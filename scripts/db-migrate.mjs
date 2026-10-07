// Applies SQL files to a disposable Postgres container. Production does not call this.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function psql(container, sql) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-tA"], {
    input: sql,
    encoding: "utf8",
  });
}

export function applyFile(container, file) {
  psql(container, readFileSync(file, "utf8"));
}
