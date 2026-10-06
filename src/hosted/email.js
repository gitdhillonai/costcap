// Brevo transactional email. HTTP acceptance is not inbox delivery.
// There is no second provider and no silent fallback.
export function createTransactionalEmail({ provider = "brevo", apiKey, from, fetchImpl = fetch } = {}) {
  if (provider !== "brevo") throw new Error("Unsupported mail provider: CostCap sends through Brevo only");
  if (!apiKey || !from) throw new Error("Email API key and verified sender required");
  const address = /^(?:[^<>]+<)?([^<>\s]+@[^<>\s]+)>?$/.exec(from)?.[1];
  if (!address) throw new Error("Invalid sender address");
  const name = from.includes("<") ? from.slice(0, from.indexOf("<")).trim() : "CostCap";
  return async ({ to, subject, text }) => {
    if (!Array.isArray(to) || !to.length || to.some((email) => typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Valid authorized recipients required");
    const escape = (value) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const body = { sender: { email: address, name }, to: to.map((email) => ({ email })), subject, textContent: text, htmlContent: `<pre>${escape(text)}</pre>` };
    const response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Email delivery HTTP ${response.status}`);
    return { status: "accepted", provider: "brevo" };
  };
}
