// Fails closed. Does not send mail and does not print secret values.
const required = ["TURNSTILE_SECRET_KEY", "BREVO_API_KEY", "COSTCAP_ALERT_ORG_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`live-proof: missing ${missing.join(", ")}; no mail was sent`);
  process.exit(2);
}
console.error("live-proof: no mail was sent");
process.exit(2);
