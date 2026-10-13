import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostedServer } from "../src/hosted/server.js";
import { createStripeBilling } from "../src/hosted/billing.js";

test("isolated signed billing callback, paid UI, owner portal and cancellation readback", async ({ page }) => {
  const secret = "whsec_local_fixture";
  const calls = [];
  let code, store, orgId, origin;
  const sub = { id: "sub_local", livemode: true, customer: "cus_local", status: "active", metadata: {}, items: { data: [{ price: { id: "price_local" }, quantity: 1 }] } };
  const invoice = { id: "in_local", livemode: true, status: "paid", currency: "usd", amount_paid: 100, customer: "cus_local", subscription: sub.id };
  let event = { id: "evt_local_paid", livemode: true, type: "invoice.paid", data: { object: invoice } };
  const provider = async (url, options = {}) => {
    const path = url.replace("https://api.stripe.com/v1", "");
    calls.push({ path, body: options.body });
    let data;
    if (path === "/account") data = { id: "acct_1TdlLm0Yt0O6HtVs", charges_enabled: true };
    if (path === "/prices/price_local?expand[]=product") data = { active: true, livemode: true, currency: "usd", unit_amount: 1900, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, product: { active: true, metadata: { app: "costcap" } } };
    if (path === "/subscriptions/sub_local") data = sub;
    if (path === "/events/" + event.id) data = event;
    if (path === "/invoices/in_local") data = invoice;
    if (path === "/billing_portal/sessions") data = { url: "https://billing.stripe.com/p/session/local-fixture" };
    return new Response(JSON.stringify(data ?? { error: { message: "Unexpected fixture path" } }), { status: data ? 200 : 404 });
  };
  const service = createHostedServer({
    storePath: join(mkdtempSync(join(tmpdir(), "cc-billing-e2e-")), "data.json"),
    origin: "http://127.0.0.1", secureCookies: false, turnstileSiteKey: "fixture-key",
    verifyChallenge: async () => true, sendCode: async d => { code = d.code; },
    billingFactory: async s => { store = s; return createStripeBilling({ store: s, secretKey: "rk_live_local_fixture", webhookSecret: secret, accountId: "acct_1TdlLm0Yt0O6HtVs", priceId: "price_local", origin: "https://costcap.example.invalid", fetchImpl: provider }); },
  });
  await service.billingReady;
  await new Promise(r => service.server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${service.server.address().port}`;
  // The server's origin guard is independent of the ephemeral listen port.
  await page.route("**/challenges.cloudflare.com/turnstile/v0/api.js*", route => route.fulfill({ contentType: "application/javascript", body: "window.turnstile={render(s,o){o.callback('local-fixture');return 1},reset(){}}" }));
  const requests = [];
  page.on("request", r => requests.push(r.url()));
  await page.route("https://billing.stripe.com/p/session/local-fixture", route => route.fulfill({ contentType: "text/html", body: "<h1>Isolated portal fixture</h1><p>No live account or payment.</p>" }));
  try {
    // Login uses the real HTTP auth flow, not a seeded browser cookie.
    const requested = await fetch(origin + "/auth/request", { method: "POST", headers: { origin: "http://127.0.0.1", "content-type": "application/json" }, body: JSON.stringify({ email: "billing-owner@example.invalid", turnstileToken: "local-fixture" }) }).then(r => r.json());
    const verified = await fetch(origin + "/auth/verify", { method: "POST", headers: { origin: "http://127.0.0.1", "content-type": "application/json" }, body: JSON.stringify({ challengeId: requested.challengeId, code }) });
    const cookie = verified.headers.get("set-cookie").split(";")[0].split("=")[1];
    await page.context().addCookies([{ name: "costcap_session", value: cookie, url: origin }]);
    orgId = store.read(s => Object.values(s.users).find(u => u.email === "billing-owner@example.invalid").orgId);
    sub.metadata = { app: "costcap", org_id: orgId };
    store.transaction(s => { s.orgs.other_fixture_org = { id: "other_fixture_org" }; });
    await page.goto(origin + "/?checkout=returned");
    await expect(page.locator("#billingStatus")).toHaveText("Free beta. No verified subscription.");
    await expect(page.locator("#portal")).toBeHidden();
    const callback = async () => {
      const raw = JSON.stringify(event), stamp = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", secret).update(`${stamp}.${raw}`).digest("hex");
      return fetch(origin + "/billing/webhook", { method: "POST", headers: { "stripe-signature": `t=${stamp},v1=${sig}` }, body: raw });
    };
    // A missing/other-app metadata event can be acknowledged, never grant entitlement.
    sub.metadata = { app: "other-app", org_id: orgId };
    event = { ...event, id: "evt_unmatched" };
    expect((await callback()).status).toBe(200);
    await page.locator("#refresh").click();
    await expect(page.locator("#billingStatus")).toHaveText("Free beta. No verified subscription.");
    sub.metadata = { app: "costcap", org_id: orgId };
    event = { ...event, id: "evt_local_paid" };
    expect((await callback()).status).toBe(200);
    expect((await (await callback()).json()).duplicate).toBe(true);
    expect(store.read(s => s.orgs[orgId].billing.invoices.in_local.amountPaid)).toBe(100);
    expect(store.read(s => s.orgs.other_fixture_org.billing)).toBeUndefined();
    await page.locator("#refresh").click();
    await expect(page.locator("#billingStatus")).toHaveText("Verified subscription: active");
    await expect(page.locator("#upgrade")).toBeHidden();
    await expect(page.locator("#portal")).toBeVisible();
    await expect(page.locator("#portal")).toBeEnabled();
    // Local evidence only; no production charge and no provider browser visit.
    if (process.env.COSTCAP_VISUAL_PROOF_DIR) await page.screenshot({ path: join(process.env.COSTCAP_VISUAL_PROOF_DIR, "costcap-isolated-paid.png"), fullPage: true });
    // Match browser origin for the portal POST, while preserving the real UI handler.
    await page.route(origin + "/billing/portal", async route => {
      const response = await fetch(route.request().url(), { method: "POST", headers: { origin: "http://127.0.0.1", cookie: `costcap_session=${cookie}`, "content-type": "application/json" }, body: "{}" });
      await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    });
    await page.locator("#portal").click();
    await expect(page.getByRole("heading", { name: "Isolated portal fixture" })).toBeVisible();
    const portal = calls.find(c => c.path === "/billing_portal/sessions");
    expect(new URLSearchParams(portal.body).get("customer")).toBe("cus_local");
    sub.status = "canceled";
    event = { id: "evt_local_canceled", livemode: true, type: "customer.subscription.deleted", data: { object: sub } };
    expect((await callback()).status).toBe(200);
    await page.goto(origin);
    await expect(page.locator("#billingStatus")).toHaveText("Verified subscription: canceled");
    if (process.env.COSTCAP_VISUAL_PROOF_DIR) await page.screenshot({ path: join(process.env.COSTCAP_VISUAL_PROOF_DIR, "costcap-isolated-canceled.png"), fullPage: true });
    expect(calls.some(c => c.path === "/checkout/sessions")).toBe(false);
    expect(requests.some(u => u.startsWith("https://api.stripe.com"))).toBe(false);
  } finally {
    service.server.closeAllConnections?.();
    await new Promise(r => service.server.close(r));
  }
});
