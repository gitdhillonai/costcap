// Provider adapters share one authorized transactional-email contract.
// No discovery, marketing sends, attachments, or auto-fallback credentials.
export function createTransactionalEmail({ provider = "resend", apiKey, from, fetchImpl = fetch } = {}) {
  if (!["resend", "brevo"].includes(provider)) throw new Error("Unsupported mail provider");
  if (!apiKey || !from) throw new Error("Email API key and verified sender required");
  const address = /^(?:[^<>]+<)?([^<>\s]+@[^<>\s]+)>?$/.exec(from)?.[1];
  if (!address) throw new Error("Invalid sender address");
  const name = from.includes("<") ? from.slice(0, from.indexOf("<")).trim() : "CostCap";
  return async ({ to, subject, text }) => {
    if (!Array.isArray(to) || !to.length || to.some((email) => typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Valid authorized recipients required");
    const isBrevo = provider === "brevo";
    const escape = (value) => value.replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const body = isBrevo ? { sender: { email: address, name }, to: to.map((email) => ({ email })), subject, textContent: text, htmlContent: `<pre>${escape(text)}</pre>` } : { from, to, subject, text };
    const response = await fetchImpl(isBrevo ? "https://api.brevo.com/v3/smtp/email" : "https://api.resend.com/emails", {
      method: "POST", headers: { "content-type": "application/json", ...(isBrevo ? { "api-key": apiKey } : { authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Email delivery HTTP ${response.status}`);
    // HTTP acceptance is not proof of inbox delivery.
    return { status: "accepted", provider };
  };
}
