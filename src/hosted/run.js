import { createTransactionalEmail } from "./email.js";
import { createHostedServer } from "./server.js";
import { createAlertDelivery } from "./delivery.js";
import { verifyProductionChallenge } from "./turnstile.js";
const required = (key) => { if (!process.env[key]) throw new Error(`${key} required`); return process.env[key]; };
if (process.env.COSTCAP_TURNSTILE_FIXTURE || process.env.COSTCAP_EMAIL_FIXTURE) throw new Error("Production launcher rejects test fixtures");
const origin = required("COSTCAP_ORIGIN");
if (new URL(origin).protocol !== "https:") throw new Error("Production origin must be HTTPS");
const turnstileKey = required("TURNSTILE_SECRET_KEY");
const emailProvider = process.env.COSTCAP_EMAIL_PROVIDER ?? "brevo";
if (emailProvider !== "brevo") throw new Error("COSTCAP_EMAIL_PROVIDER must be brevo");
const emailKey = required("BREVO_API_KEY");
const from = required("COSTCAP_EMAIL_FROM");
const emailTo = process.env.COSTCAP_ALERT_EMAILS?.split(",").map((x) => x.trim()).filter(Boolean);
const authorizedOrg = process.env.COSTCAP_ALERT_ORG_ID;
const sendEmail = createTransactionalEmail({ provider: "brevo", apiKey: emailKey, from });
const delivery = createAlertDelivery({ emailKey, emailFrom: from, emailTo, slackWebhook: process.env.COSTCAP_SLACK_WEBHOOK });
const { server, evaluateFleetAlerts } = createHostedServer({
  origin,
  turnstileSiteKey: required("TURNSTILE_SITE_KEY"),
  storePath: process.env.COSTCAP_STORE_PATH ?? "/data/costcap.json",
  verifyChallenge: (response, remoteip) => verifyProductionChallenge({ response, remoteip, secret: turnstileKey, origin }),
  sendCode: async ({ email, code }) => {
    // Deployment requires owner-approved transactional-email identity/scope.
    await sendEmail({ to: [email], subject: "CostCap sign-in code", text: `Your CostCap code is ${code}. It expires in 10 minutes. If you did not request it, ignore it.` });
  },
  sendInvite: async ({ email, role, orgName }) => {
    await sendEmail({ to: [email], subject: "CostCap organization invitation", text: `You were invited to the ${orgName} CostCap organization as ${role}. Sign in with this email address. The invitation expires in 7 days. If you did not expect it, ignore it. Guardrails, not guarantees.` });
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
