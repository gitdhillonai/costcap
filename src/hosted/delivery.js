import { createTransactionalEmail } from "./email.js";
// Hosted delivery adapter. The caller authorizes recipients and supplies secrets.
// Tests pass a fake fetch. This module does not send by itself.
export function createAlertDelivery({ emailKey, emailFrom, emailTo, slackWebhook, fetchImpl = fetch } = {}) {
  if (slackWebhook) {
    const url = new URL(slackWebhook);
    if (url.protocol !== "https:" || url.hostname !== "hooks.slack.com" || !url.pathname.startsWith("/services/")) throw new Error("Slack webhook must use hooks.slack.com/services over HTTPS");
  }
  const post = async (url, headers, body) => {
    const response = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`delivery HTTP ${response.status}`);
  };
  return async (alert) => {
    const text = `CostCap ${alert.kind}: agent ${alert.agentId ?? "unknown"}${alert.scope ? `, ${alert.scope}` : ""}. Estimated spend guardrails, not a billing guarantee.`;
    const results = [];
    if (emailKey && emailFrom && emailTo?.length) {
      try {
        await createTransactionalEmail({ apiKey: emailKey, from: emailFrom, fetchImpl })({ to: emailTo, subject: `CostCap: ${alert.kind}`, text });
        results.push({ channel: "email", status: "accepted" });
      } catch (err) { results.push({ channel: "email", status: "failed", error: err.message }); }
    } else results.push({ channel: "email", status: "unconfigured" });
    if (slackWebhook) {
      try { await post(slackWebhook, {}, { text }); results.push({ channel: "slack", status: "accepted" }); }
      catch (err) { results.push({ channel: "slack", status: "failed", error: err.message }); }
    } else results.push({ channel: "slack", status: "unconfigured" });
    return results;
  };
}
