// Production Turnstile check. There is no fixture token and no bypass flag.
export async function verifyProductionChallenge({ response, remoteip, secret, origin, fetchImpl = globalThis.fetch }) {
  if (typeof response !== "string" || response.length === 0 || response.length > 2048) return false;
  const result = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret, response, remoteip }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await result.json();
  return result.ok === true && body.success === true && body.hostname === new URL(origin).hostname;
}
