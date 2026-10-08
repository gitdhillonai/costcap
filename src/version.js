// Single source of truth for the product version: the root package.json.
// Keeping one copy prevents the CLI and the hosted /health endpoint from
// drifting apart as the package is bumped.
import { readFileSync } from "node:fs";

export const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
