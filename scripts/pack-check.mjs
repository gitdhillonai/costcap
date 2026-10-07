import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function reviewPack(paths) {
  const allowed = (path) => path === "package.json" || path === "README.md" || path === "LICENSE" || (path.startsWith("src/") && !path.includes(".."));
  const missing = ["package.json", "README.md", "LICENSE"].filter((path) => !paths.includes(path));
  const unexpected = paths.filter((path) => !allowed(path) || path.includes(".env"));
  const hasSource = paths.some((path) => path.startsWith("src/"));
  return { missing, unexpected, hasSource };
}

export function readPackPaths() {
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(raw);
  const pack = Array.isArray(parsed) ? parsed[0] : parsed[Object.keys(parsed)[0]];
  return pack.files.map((file) => file.path);
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const review = reviewPack(readPackPaths());
  if (review.missing.length || review.unexpected.length || !review.hasSource) {
    console.error(`pack: missing ${review.missing.join(", ") || "none"}; unexpected ${review.unexpected.join(", ") || "none"}`);
    process.exit(1);
  }
  console.error("pack: manifest, README, LICENSE, and src only");
}
