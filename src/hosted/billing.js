// Stripe Checkout for an optional hosted workspace plan. Never trust a return URL
// as payment evidence. All amounts/currency/intervals are checked server-side.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
const problem = (status, message) => Object.assign(new Error(message), { status });

// Public probe. Booleans only: never echo a key, webhook secret, account id, or price id.
export function stripeHealth({ enabled = false, env = {}, mode = env.COSTCAP_STRIPE_MODE || "live" } = {}) {
  const secret = env.COSTCAP_STRIPE_SECRET_KEY ?? "";
  const webhook = env.COSTCAP_STRIPE_WEBHOOK_SECRET ?? "";
  const account = env.COSTCAP_STRIPE_ACCOUNT_ID ?? "";
  const price = env.COSTCAP_STRIPE_PRICE_ID ?? "";
  const checks = {
    secretKey: mode === "test" ? secret.startsWith("sk_test_") : /^(sk_live_|rk_live_)/.test(secret),
    webhookSecret: webhook.startsWith("whsec_") && webhook.length > "whsec_".length,
    accountId: /^acct_[A-Za-z0-9]+$/.test(account),
    priceId: /^price_[A-Za-z0-9]+$/.test(price),
  };
  const shapes = Object.values(checks).every(Boolean);
  let stripe = "disabled";
  if (enabled && shapes) stripe = "ready";
  else if (enabled || shapes) stripe = "misconfigured";
  return { status: "ok", stripe, checks };
}
export function verifyStripeEvent(raw, signature, secret, now = Date.now(), { livemode = true } = {}) {
  const fields = String(signature ?? '').split(',').map(x => x.split('='));
  const stamp = fields.find(([k]) => k === 't')?.[1];
  if (!/^\d+$/.test(stamp ?? '') || Math.abs(now / 1000 - Number(stamp)) > 300) throw problem(400, 'Invalid webhook timestamp');
  const expected = createHmac('sha256', secret).update(`${stamp}.${raw}`).digest();
  const valid = fields.filter(([k]) => k === 'v1').some(([, value]) => {
    if (!/^[0-9a-f]{64}$/.test(value ?? '')) return false;
    return timingSafeEqual(expected, Buffer.from(value, 'hex'));
  });
  if (!valid) throw problem(400, 'Invalid webhook signature');
  let event;
  try { event = JSON.parse(raw); } catch { throw problem(400, 'Invalid webhook JSON'); }
  if (!event.id || (livemode !== null && event.livemode !== livemode)) throw problem(400, livemode ? 'Live event required' : 'Test event required');
  return event;
}
export async function createStripeBilling({ secretKey, webhookSecret, accountId, priceId, origin, store,
  fetchImpl = fetch, now = () => Date.now() }) {
  if (!/^sk_live_/.test(secretKey ?? '') && !/^rk_live_/.test(secretKey ?? '')) throw new Error('Live restricted Stripe key required');
  if (!webhookSecret?.startsWith('whsec_') || !/^acct_/.test(accountId ?? '') || !/^price_/.test(priceId ?? '')) throw new Error('Stripe readback configuration required');
  if (new URL(origin).protocol !== 'https:') throw new Error('Billing requires HTTPS');
  const request = async (path, data, idempotencyKey) => {
    const res = await fetchImpl(`https://api.stripe.com/v1${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${secretKey}`, ...(data === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
      body: data === undefined ? undefined : new URLSearchParams(data).toString(), redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw problem(503, 'Billing provider unavailable');
    return res.json();
  };
  const account = await request('/account');
  if (accountId !== 'acct_1TdlLm0Yt0O6HtVs' || account.id !== accountId || !account.charges_enabled) throw new Error('Persoon.ai Inc live account readback failed');
  const price = await request(`/prices/${encodeURIComponent(priceId)}?expand[]=product`);
  if (!price.active || price.livemode !== true || price.currency !== 'usd' || price.unit_amount !== 1900 || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== 'licensed' || !price.product?.active || price.product.metadata?.app !== 'costcap') throw new Error('CostCap $19/month price readback failed');
  const publicStatus = (s, orgId) => {
    const b = s.orgs[orgId]?.billing;
    return { enabled: true, amount: 1900, currency: 'usd', interval: 'month', status: b?.status ?? 'free_beta',
      cancelAtPeriodEnd: b?.cancelAtPeriodEnd ?? false, paidInvoiceCount: b?.paidInvoiceCount ?? 0 };
  };
  const applySubscription = (orgId, sub) => {
    if (sub.livemode !== true || sub.metadata?.app !== 'costcap' || sub.metadata?.org_id !== orgId || sub.items?.data?.length !== 1 || sub.items.data[0].price.id !== priceId || sub.items.data[0].quantity !== 1) throw problem(400, 'Subscription scope mismatch');
    store.transaction(s => {
      if (!s.orgs[orgId]) throw problem(400, 'Unknown workspace');
      const b = s.orgs[orgId].billing ??= {};
      // Never switch the workspace to another subscription from a late event.
      if (b.subscriptionId && b.subscriptionId !== sub.id) throw problem(409, 'Subscription conflict');
      Object.assign(b, { subscriptionId: sub.id, customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
        status: sub.status, cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end), verifiedAt: now() });
    });
  };
  const syncCheckout = async (orgId) => {
    const pending = store.read(s => s.orgs[orgId]?.billing?.checkout);
    if (!pending?.id) return null;
    const session = await request(`/checkout/sessions/${encodeURIComponent(pending.id)}`);
    if (session.client_reference_id !== orgId || session.metadata?.app !== 'costcap' || session.metadata?.org_id !== orgId || session.livemode !== true) throw problem(400, 'Checkout scope mismatch');
    if (session.status === 'complete' && session.subscription) {
      const sub = await request(`/subscriptions/${encodeURIComponent(typeof session.subscription === 'string' ? session.subscription : session.subscription.id)}`);
      applySubscription(orgId, sub);
    }
    return session;
  };
  return {
    accountId, priceId,
    async status(orgId) {
      const subId = store.read(s => s.orgs[orgId]?.billing?.subscriptionId);
      if (subId) applySubscription(orgId, await request(`/subscriptions/${encodeURIComponent(subId)}`));
      else await syncCheckout(orgId);
      return store.read(s => publicStatus(s, orgId));
    },
    async checkout(user) {
      const existing = await syncCheckout(user.orgId);
      const state = store.read(s => s.orgs[user.orgId]?.billing ?? {});
      if (state.subscriptionId && !['canceled', 'incomplete_expired'].includes(state.status)) throw problem(409, 'Manage your existing subscription instead');
      if (state.subscriptionId) throw problem(409, 'Contact support before starting a new subscription');
      if (existing?.status === 'open') {
        if (!/^https:\/\/checkout\.stripe\.com\//.test(existing.url ?? '')) throw problem(503, 'Invalid Checkout response');
        return { url: existing.url };
      }
      let key;
      store.transaction(s => {
        const b = s.orgs[user.orgId].billing ??= {};
        if (!b.checkout || (existing && existing.status === 'expired')) b.checkout = { key: `costcap-${randomUUID()}` };
        key = b.checkout.key;
      });
      const session = await request('/checkout/sessions', {
        mode: 'subscription', 'line_items[0][price]': priceId, 'line_items[0][quantity]': '1',
        client_reference_id: user.orgId, customer_email: user.email,
        'metadata[app]': 'costcap', 'metadata[org_id]': user.orgId,
        'subscription_data[metadata][app]': 'costcap', 'subscription_data[metadata][org_id]': user.orgId,
        success_url: `${origin}/?checkout=returned`, cancel_url: `${origin}/?checkout=canceled`,
        allow_promotion_codes: 'true',
      }, key);
      if (session.livemode !== true || !session.id || !/^https:\/\/checkout\.stripe\.com\//.test(session.url ?? '')) throw problem(503, 'Invalid Checkout response');
      store.transaction(s => { s.orgs[user.orgId].billing.checkout.id = session.id; });
      return { url: session.url };
    },
    async portal(orgId) {
      const customer = store.read(s => s.orgs[orgId]?.billing?.customerId);
      if (!customer) throw problem(409, 'No billing customer yet');
      const session = await request('/billing_portal/sessions', { customer, return_url: `${origin}/` });
      if (!/^https:\/\/billing\.stripe\.com\//.test(session.url ?? '')) throw problem(503, 'Invalid billing portal response');
      return { url: session.url };
    },
    async webhook(raw, signature) {
      const event = verifyStripeEvent(raw, signature, webhookSecret, now());
      if (store.read(s => Boolean(s.billingEvents?.[event.id]))) return { received: true, duplicate: true };
      const supported = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid'];
      if (supported.includes(event.type)) {
        // Retrieve the event from the scoped live account before using its object.
        const verified = await request(`/events/${encodeURIComponent(event.id)}`);
        if (verified.id !== event.id || verified.type !== event.type || verified.livemode !== true) throw problem(400, 'Event readback failed');
        const object = verified.data.object;
        let subId;
        if (event.type.startsWith('customer.subscription.')) subId = object.id;
        else subId = object.subscription ?? object.parent?.subscription_details?.subscription;
        if (subId) {
          const sub = await request(`/subscriptions/${encodeURIComponent(typeof subId === 'string' ? subId : subId.id)}`);
          if (sub.metadata?.app === 'costcap') {
            const orgId = sub.metadata.org_id;
            applySubscription(orgId, sub);
            if (event.type === 'invoice.paid') {
              const invoice = await request(`/invoices/${encodeURIComponent(object.id)}`);
              if (invoice.livemode !== true || invoice.status !== 'paid' || invoice.currency !== 'usd' || invoice.amount_paid < 0 || invoice.customer !== sub.customer) throw problem(400, 'Invoice readback failed');
              store.transaction(s => {
                const b = s.orgs[orgId].billing; b.invoices ??= {};
                b.invoices[invoice.id] = { amountPaid: invoice.amount_paid, currency: invoice.currency, verifiedAt: now() };
                b.paidInvoiceCount = Object.values(b.invoices).filter(i => i.amountPaid > 0).length;
              });
            }
          }
        }
      }
      store.transaction(s => { s.billingEvents ??= {}; s.billingEvents[event.id] = { type: event.type, at: now() }; });
      return { received: true };
    },
  };
}

// Test-mode checkout. Construction does not call Stripe. sk_live_ and every
// other secret return null. This does not create or edit a price.
export function createTestModeStripeBilling({ secretKey, webhookSecret, priceId, origin, store,
  fetchImpl = fetch, now = () => Date.now(), log = console.error } = {}) {
  if (!String(secretKey ?? "").startsWith("sk_test_")) {
    log("costcap: test-mode Stripe key refused");
    return null;
  }
  if (!String(webhookSecret ?? "").startsWith("whsec_") || !/^price_[A-Za-z0-9]+$/.test(priceId ?? "")) {
    log("costcap: test-mode Stripe configuration refused");
    return null;
  }
  const request = async (path, data) => {
    const res = await fetchImpl(`https://api.stripe.com/v1${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data).toString(), redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw problem(503, "Billing provider unavailable");
    return res.json();
  };
  const ended = new Set(["canceled", "unpaid", "incomplete_expired"]);
  const read = async (path) => {
    const res = await fetchImpl(`https://api.stripe.com/v1${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${secretKey}` },
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw problem(503, "Billing provider unavailable");
    return res.json();
  };
  const publicStatus = (s, orgId) => {
    const b = s.orgs[orgId]?.billing;
    const status = b?.status ?? "free_beta";
    return { enabled: true, amount: null, currency: "usd", interval: "month",
      status: ended.has(status) ? "free_beta" : status,
      cancelAtPeriodEnd: b?.cancelAtPeriodEnd ?? false, paidInvoiceCount: b?.paidInvoiceCount ?? 0 };
  };
  const scoped = (sub) => sub?.livemode === false && sub.metadata?.app === "costcap"
    && sub.items?.data?.length === 1 && sub.items.data[0].price.id === priceId && sub.items.data[0].quantity === 1;
  const applySubscription = (sub) => {
    if (!scoped(sub)) return false;
    const orgId = sub.metadata.org_id;
    store.transaction(s => {
      if (!s.orgs[orgId]) throw problem(400, "Unknown workspace");
      const b = s.orgs[orgId].billing ??= {};
      if (b.subscriptionId && b.subscriptionId !== sub.id && !ended.has(b.status)) throw problem(409, "Subscription conflict");
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (ended.has(sub.status)) {
        b.lastSubscriptionId = sub.id;
        delete b.subscriptionId;
        Object.assign(b, { customerId, status: "free_beta", endedStatus: sub.status, cancelAtPeriodEnd: false, verifiedAt: now() });
      } else {
        Object.assign(b, {
          subscriptionId: sub.id, customerId, status: sub.status,
          cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end), verifiedAt: now(),
        });
      }
    });
    return true;
  };
  const recordInvoice = (orgId, invoice) => {
    if (invoice?.livemode !== false || invoice.currency !== "usd" || !invoice.id) return;
    if (!store.read(s => s.orgs[orgId])) return;
    store.transaction(s => {
      const b = s.orgs[orgId].billing ??= {};
      b.invoices ??= {};
      const amountPaid = invoice.status === "paid" && invoice.amount_paid > 0 ? invoice.amount_paid : 0;
      b.invoices[invoice.id] = { amountPaid, currency: invoice.currency, verifiedAt: now() };
      b.paidInvoiceCount = Object.values(b.invoices).filter(i => i.amountPaid > 0).length;
    });
  };
  return {
    async status(orgId) {
      const subId = store.read(s => s.orgs[orgId]?.billing?.subscriptionId);
      if (subId) {
        const sub = await read(`/subscriptions/${encodeURIComponent(subId)}`);
        if (sub.livemode === false) applySubscription(sub);
      }
      return store.read(s => publicStatus(s, orgId));
    },
    async checkout(user) {
      const state = store.read(s => s.orgs[user.orgId]?.billing ?? {});
      if (state.subscriptionId && !ended.has(state.status)) throw problem(409, "Manage your existing subscription instead");
      const session = await request("/checkout/sessions", {
        mode: "subscription", "line_items[0][price]": priceId, "line_items[0][quantity]": "1",
        client_reference_id: user.orgId, customer_email: user.email,
        "metadata[app]": "costcap", "metadata[org_id]": user.orgId,
        "subscription_data[metadata][app]": "costcap", "subscription_data[metadata][org_id]": user.orgId,
        success_url: `${origin}/?checkout=returned`, cancel_url: `${origin}/?checkout=canceled`,
      });
      if (session.livemode !== false || !session.id || !/^https:\/\/checkout\.stripe\.com\//.test(session.url ?? "")) {
        throw problem(503, "Invalid Checkout response");
      }
      return { url: session.url };
    },
    async portal(orgId) {
      const customer = store.read(s => s.orgs[orgId]?.billing?.customerId);
      if (!customer) throw problem(409, "No billing customer yet");
      const session = await request("/billing_portal/sessions", { customer, return_url: `${origin}/` });
      if (session.livemode !== false || !/^https:\/\/billing\.stripe\.com\//.test(session.url ?? "")) {
        throw problem(503, "Invalid billing portal response");
      }
      return { url: session.url };
    },
    async webhook(raw, signature) {
      const event = verifyStripeEvent(raw, signature, webhookSecret, now(), { livemode: null });
      if (event.livemode !== false) return { received: true, ignored: true };
      if (store.read(s => Boolean(s.billingEvents?.[event.id]))) return { received: true, duplicate: true };
      const object = event.data?.object;
      let subId = null;
      if (event.type?.startsWith("customer.subscription.")) subId = object?.id;
      else if (event.type === "checkout.session.completed" || event.type === "invoice.paid") {
        subId = object?.subscription ?? object?.parent?.subscription_details?.subscription;
      }
      if (typeof subId === "string") {
        const sub = await read(`/subscriptions/${encodeURIComponent(subId)}`);
        if (sub.livemode !== false) {
          store.transaction(s => { s.billingEvents ??= {}; s.billingEvents[event.id] = { type: event.type, at: now(), ignored: true }; });
          return { received: true, ignored: true };
        }
        applySubscription(sub);
        if (event.type === "invoice.paid" && object?.id) {
          const invoice = await read(`/invoices/${encodeURIComponent(object.id)}`);
          if (invoice.livemode === false) recordInvoice(sub.metadata?.org_id, invoice);
        }
      }
      if (event.type === "charge.refunded" && typeof object?.invoice === "string") {
        const invoice = await read(`/invoices/${encodeURIComponent(object.invoice)}`);
        if (invoice.livemode === false) {
          const orgId = invoice.metadata?.org_id ?? invoice.subscription_details?.metadata?.org_id;
          recordInvoice(orgId, invoice);
        }
      }
      store.transaction(s => { s.billingEvents ??= {}; s.billingEvents[event.id] = { type: event.type, at: now() }; });
      return { received: true };
    },
  };
}
