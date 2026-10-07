// Fails closed before any deploy. Prints names, never values. Does not apply.
const required = ["COSTCAP_ORIGIN", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "BREVO_API_KEY", "COSTCAP_EMAIL_FROM"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`deploy: missing ${missing.join(", ")}`);
  process.exit(2);
}
let origin;
try { origin = new URL(process.env.COSTCAP_ORIGIN); }
catch { console.error("deploy: COSTCAP_ORIGIN is not a URL"); process.exit(2); }
if (origin.protocol !== "https:") {
  console.error("deploy: COSTCAP_ORIGIN must be https");
  process.exit(2);
}
if ((process.env.COSTCAP_EMAIL_PROVIDER ?? "brevo") !== "brevo") {
  console.error("deploy: COSTCAP_EMAIL_PROVIDER must be brevo");
  process.exit(2);
}
if (Number(process.env.COSTCAP_REPLICAS ?? "1") !== 1) {
  console.error("deploy: the JSON store allows one replica");
  process.exit(2);
}
console.error("deploy: preflight passed; apply was not run");
