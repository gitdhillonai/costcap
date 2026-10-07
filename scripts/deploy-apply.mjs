// This gate never applies. A host credential does not authorize an SSH change.
console.error("deploy: apply was not run; no host change is performed");
process.exit(2);
