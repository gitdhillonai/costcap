import { createTransactionalEmail } from "./email.js";
import { createHostedServer } from "./server.js";
import { createAlertDelivery } from "./delivery.js";
const required = (key) => { if (!process.env[key]) throw new Error(`${key} required`); return process.env[key]; };
const origin = required("COSTCAP_ORIGIN");
if (new URL(origin).protocol !== "https:") throw new Error("Production origin must be HTTPS");
const turnstileKey = required("TURNSTILE_SECRET_KEY");
const emailProvider = process.env.COSTCAP_EMAIL_PROVIDER ?? "resend";
const emailKey = required(emailProvider === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY");
const from = required("COSTCAP_EMAIL_FROM");
const emailTo = process.env.COSTCAP_ALERT_EMAILS?.split(",").map((x) => x.trim()).filter(Boolean);
const authorizedOrg = process.env.COSTCAP_ALERT_ORG_ID;
const sendEmail = createTransactionalEmail({ provider: emailProvider, apiKey: emailKey, from });
const delivery = createAlertDelivery({ emailProvider, emailKey, emailFrom: from, emailTo, slackWebhook: process.env.COSTCAP_SLACK_WEBHOOK });
const { server, evaluateFleetAlerts } = createHostedServer({
  origin,
  turnstileSiteKey: required("TURNSTILE_SITE_KEY"),
  storePath: process.env.COSTCAP_STORE_PATH ?? "/data/costcap.json",
  verifyChallenge: async (response, remoteip) => {
    if (typeof response !== "string" || response.length > 2048) return false;
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: turnstileKey, response, remoteip }), signal: AbortSignal.timeout(5000) });
    const body = await result.json();
    return result.ok && body.success === true && body.hostname === new URL(origin).hostname;
  },
  sendCode: async ({ email, code }) => {
    // Deployment requires owner-approved transactional-email identity/scope.
    await sendEmail({ to: [email], subject: "CostCap sign-in code", text: `Your CostCap code is ${code}. It expires in 10 minutes. If you did not request it, ignore it.` });
  },
  deliverAlert: (alert) => authorizedOrg && alert.orgId === authorizedOrg ? delivery(alert) : [{ status: "unconfigured" }],
});
let alertRunning = false;
const interval = setInterval(async () => {
  if (alertRunning) return;
  alertRunning = true;
  try { await evaluateFleetAlerts(); } catch { console.error("costcap: alert sweep failed"); }
  finally { alertRunning = false; }
}, 60_000);
server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0", () => console.error("costcap: beta service ready; billing disabled"));
const stop = () => { clearInterval(interval); server.close(() => process.exit(0)); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
