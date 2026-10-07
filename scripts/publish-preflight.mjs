// Never publishes. A present token is still not a publish.
if (!process.env.NPM_TOKEN) {
  console.error("publish: NPM_TOKEN is missing; npm publish was not run");
  process.exit(2);
}
console.error("publish: npm publish was not run");
process.exit(2);
