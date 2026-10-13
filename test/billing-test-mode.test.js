import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../src/hosted/store.js';
import { createTestModeStripeBilling, stripeHealth } from '../src/hosted/billing.js';
import { createHostedServer } from '../src/hosted/server.js';

const secret = 'whsec_fixture';
const clock = 1800000000000;
const sign = raw => `t=${clock / 1000},v1=${createHmac('sha256', secret).update(`${clock / 1000}.${raw}`).digest('hex')}`;

function sub(id, status, price = 'price_fixture') {
  return { id, livemode: false, customer: 'cus_test', status, cancel_at_period_end: false,
    metadata: { app: 'costcap', org_id: 'org1' }, items: { data: [{ price: { id: price }, quantity: 1 }] } };
}

function harness() {
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'cc-test-mode-')), 'store.json'));
  store.transaction(s => { s.orgs.org1 = { id: 'org1' }; });
  const calls = [];
  const remote = { subscriptions: {}, invoices: {}, sessions: {} };
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const path = url.replace('https://api.stripe.com/v1', '');
    const method = opts?.method ?? 'GET';
    if (method === 'GET' && path.startsWith('/subscriptions/')) {
      const body = remote.subscriptions[decodeURIComponent(path.slice('/subscriptions/'.length))];
      return body ? new Response(JSON.stringify(body)) : new Response('{}', { status: 404 });
    }
    if (method === 'GET' && path.startsWith('/invoices/')) {
      const body = remote.invoices[decodeURIComponent(path.slice('/invoices/'.length))];
      return body ? new Response(JSON.stringify(body)) : new Response('{}', { status: 404 });
    }
    if (method === 'GET' && path.startsWith('/checkout/sessions/')) {
      const body = remote.sessions[decodeURIComponent(path.slice('/checkout/sessions/'.length))];
      return body ? new Response(JSON.stringify(body)) : new Response('{}', { status: 404 });
    }
    if (path === '/checkout/sessions') {
      const form = new URLSearchParams(opts.body);
      const session = {
        id: 'cs_test', livemode: false, status: 'open', url: 'https://checkout.stripe.com/c/pay/test-fixture',
        client_reference_id: form.get('client_reference_id'),
        metadata: { app: form.get('metadata[app]'), org_id: form.get('metadata[org_id]') },
      };
      remote.sessions[session.id] = session;
      return new Response(JSON.stringify(session));
    }
    if (path === '/billing_portal/sessions') {
      return new Response(JSON.stringify({ livemode: false, url: 'https://billing.stripe.com/p/session/test-fixture' }));
    }
    return new Response('{}', { status: 404 });
  };
  return { store, calls, fetchImpl, remote };
}

test('test mode accepts only sk_test_ and does not call Stripe while building', () => {
  const { store, calls, fetchImpl } = harness();
  const logs = [];
  const client = createTestModeStripeBilling({
    secretKey: 'sk_test_fixture', webhookSecret: secret, priceId: 'price_fixture',
    origin: 'https://app.costcap.dev', store, fetchImpl, now: () => clock, log: m => logs.push(m),
  });
  assert.equal(typeof client.checkout, 'function');
  assert.equal(calls.length, 0);
  for (const secretKey of ['sk_live_' + 'fixture', 'rk_live_fixture', 'rk_test_fixture', '']) {
    const refused = createTestModeStripeBilling({
      secretKey, webhookSecret: secret, priceId: 'price_fixture', origin: 'https://app.costcap.dev',
      store, fetchImpl, log: m => logs.push(m),
    });
    assert.equal(refused, null);
  }
  assert.equal(calls.length, 0);
  assert.equal(logs.some(line => line.includes('sk_live_' + '') || line.includes('sk_test_')), false);
  const env = {
    COSTCAP_STRIPE_MODE: 'test',
    COSTCAP_STRIPE_SECRET_KEY: 'sk_test_fixture',
    COSTCAP_STRIPE_WEBHOOK_SECRET: secret,
    COSTCAP_STRIPE_ACCOUNT_ID: 'acct_fixture',
    COSTCAP_STRIPE_PRICE_ID: 'price_fixture',
  };
  assert.equal(stripeHealth({ enabled: true, env }).stripe, 'ready');
  assert.equal(stripeHealth({ enabled: true, env: { ...env, COSTCAP_STRIPE_SECRET_KEY: 'sk_live_' + 'fixture' } }).stripe, 'misconfigured');
  assert.equal(JSON.stringify(stripeHealth({ enabled: true, env })).includes('sk_test_fixture'), false);
});

test('checkout posts the configured price and drops a livemode session', async () => {
  const { store, calls, fetchImpl } = harness();
  const client = createTestModeStripeBilling({
    secretKey: 'sk_test_fixture', webhookSecret: secret, priceId: 'price_owner',
    origin: 'https://app.costcap.dev', store, fetchImpl, now: () => clock, log: () => {},
  });
  const session = await client.checkout({ orgId: 'org1', email: 'owner@example.invalid' });
  assert.equal(session.url, 'https://checkout.stripe.com/c/pay/test-fixture');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/checkout/sessions');
  const form = new URLSearchParams(calls[0].opts.body);
  assert.equal(form.get('line_items[0][price]'), 'price_owner');
  assert.equal(calls[0].opts.headers['idempotency-key']?.startsWith('costcap-'), true);
  assert.equal(store.read(s => s.orgs.org1.billing.checkout.id), 'cs_test');
  assert.equal(calls.some(c => c.url.includes('/prices')), false);
  assert.equal((await client.status('org1')).status, 'free_beta');
  calls.length = 0;
  const liveFetch = async () => new Response(JSON.stringify({ id: 'cs_live', livemode: true, url: 'https://checkout.stripe.com/c/pay/live' }));
  const liveClient = createTestModeStripeBilling({
    secretKey: 'sk_test_fixture', webhookSecret: secret, priceId: 'price_owner',
    origin: 'https://app.costcap.dev', store, fetchImpl: liveFetch, now: () => clock, log: () => {},
  });
  await assert.rejects(liveClient.checkout({ orgId: 'org1', email: 'owner@example.invalid' }), /Invalid Checkout/);
});

async function post(client, event) {
  const raw = JSON.stringify(event);
  return client.webhook(raw, sign(raw));
}

test('a signed livemode webhook does not grant a paid plan', async () => {
  const { store, fetchImpl, remote, calls } = harness();
  const client = createTestModeStripeBilling({
    secretKey: 'sk_test_fixture', webhookSecret: secret, priceId: 'price_fixture',
    origin: 'https://app.costcap.dev', store, fetchImpl, now: () => clock, log: () => {},
  });
  const live = {
    id: 'evt_live', livemode: true, type: 'customer.subscription.updated',
    data: { object: { id: 'sub_live', livemode: true, status: 'active', metadata: { app: 'costcap', org_id: 'org1' }, items: { data: [{ price: { id: 'price_fixture' }, quantity: 1 }] } } },
  };
  assert.deepEqual(await post(client, live), { received: true, ignored: true });
  assert.equal((await client.status('org1')).status, 'free_beta');
  assert.equal(store.read(s => s.orgs.org1.billing), undefined);
  remote.subscriptions.sub_test = { ...sub('sub_test', 'active'), livemode: true };
  await post(client, { id: 'evt_read_live', livemode: false, type: 'customer.subscription.updated', data: { object: { id: 'sub_test' } } });
  assert.equal((await client.status('org1')).status, 'free_beta');
  remote.subscriptions.sub_test = sub('sub_test', 'active');
  assert.equal((await post(client, { id: 'evt_test', livemode: false, type: 'customer.subscription.updated', data: { object: { id: 'sub_test', status: 'active' } } })).received, true);
  assert.equal(calls.some(c => c.url === 'https://api.stripe.com/v1/subscriptions/sub_test' && (c.opts?.method ?? 'GET') === 'GET'), true);
  assert.equal((await client.status('org1')).status, 'active');
  assert.equal((await client.status('org1')).amount, null);
  assert.equal((await client.portal('org1')).url, 'https://billing.stripe.com/p/session/test-fixture');
});

test('ended and past_due test subscriptions and a refunded invoice', async () => {
  const { store, fetchImpl, remote } = harness();
  const client = createTestModeStripeBilling({
    secretKey: 'sk_test_fixture', webhookSecret: secret, priceId: 'price_fixture',
    origin: 'https://app.costcap.dev', store, fetchImpl, now: () => clock, log: () => {},
  });
  remote.subscriptions.sub_due = sub('sub_due', 'past_due');
  await post(client, { id: 'evt_due', livemode: false, type: 'customer.subscription.updated', data: { object: { id: 'sub_due' } } });
  assert.equal((await client.status('org1')).status, 'past_due');
  await assert.rejects(client.checkout({ orgId: 'org1', email: 'owner@example.invalid' }), /existing subscription/);
  remote.subscriptions.sub_due = sub('sub_due', 'canceled');
  await post(client, { id: 'evt_cancel', livemode: false, type: 'customer.subscription.deleted', data: { object: { id: 'sub_due' } } });
  assert.equal((await client.status('org1')).status, 'free_beta');
  assert.equal(store.read(s => s.orgs.org1.billing.subscriptionId), undefined);
  assert.equal((await client.checkout({ orgId: 'org1', email: 'owner@example.invalid' })).url, 'https://checkout.stripe.com/c/pay/test-fixture');
  remote.subscriptions.sub_paid = sub('sub_paid', 'active');
  remote.invoices.in_test = {
    id: 'in_test', livemode: false, status: 'paid', currency: 'usd', amount_paid: 100,
    customer: 'cus_test', subscription: 'sub_paid', metadata: { org_id: 'org1' },
  };
  await post(client, { id: 'evt_paid', livemode: false, type: 'invoice.paid', data: { object: { id: 'in_test', subscription: 'sub_paid' } } });
  assert.equal((await client.status('org1')).paidInvoiceCount, 1);
  remote.invoices.in_test.amount_paid = 0;
  await post(client, { id: 'evt_refund', livemode: false, type: 'charge.refunded', data: { object: { id: 'ch_test', invoice: 'in_test' } } });
  assert.equal((await client.status('org1')).paidInvoiceCount, 0);
  assert.equal((await client.status('org1')).amount, null);
});

test('a foreign test invoice or refund does not change the paid count', async () => {
  const { store, fetchImpl, remote } = harness();
  store.transaction(s => { s.orgs.org2 = { id: 'org2' }; });
  const client = createTestModeStripeBilling({
    secretKey: 'sk_test_fixture', webhookSecret: secret, priceId: 'price_fixture',
    origin: 'https://app.costcap.dev', store, fetchImpl, now: () => clock, log: () => {},
  });
  const foreign = (id, patch) => ({ ...sub(id, 'active'), ...patch });
  remote.subscriptions.sub_other = foreign('sub_other', { metadata: { app: 'other', org_id: 'org1' } });
  remote.invoices.in_other = {
    id: 'in_other', livemode: false, status: 'paid', currency: 'usd', amount_paid: 1900,
    customer: 'cus_test', subscription: 'sub_other', metadata: { org_id: 'org1' },
  };
  await post(client, { id: 'evt_foreign', livemode: false, type: 'invoice.paid', data: { object: { id: 'in_other', subscription: 'sub_other' } } });
  remote.subscriptions.sub_price = foreign('sub_price', {});
  remote.subscriptions.sub_price.items.data[0].price.id = 'price_other';
  remote.invoices.in_price = { ...remote.invoices.in_other, id: 'in_price', subscription: 'sub_price' };
  await post(client, { id: 'evt_price', livemode: false, type: 'invoice.paid', data: { object: { id: 'in_price', subscription: 'sub_price' } } });
  remote.subscriptions.sub_ok = sub('sub_ok', 'active');
  remote.invoices.in_mismatch = {
    id: 'in_mismatch', livemode: false, status: 'paid', currency: 'usd', amount_paid: 1900,
    customer: 'cus_other', subscription: 'sub_ok', metadata: { org_id: 'org1' },
  };
  await post(client, { id: 'evt_customer', livemode: false, type: 'invoice.paid', data: { object: { id: 'in_mismatch', subscription: 'sub_ok' } } });
  assert.equal((await client.status('org1')).paidInvoiceCount, 0);
  assert.equal((await client.status('org1')).status, 'active');
  remote.invoices.in_ok = {
    id: 'in_ok', livemode: false, status: 'paid', currency: 'usd', amount_paid: 100,
    customer: 'cus_test', subscription: 'sub_ok',
  };
  await post(client, { id: 'evt_ok', livemode: false, type: 'invoice.paid', data: { object: { id: 'in_ok', subscription: 'sub_ok' } } });
  assert.equal((await client.status('org1')).paidInvoiceCount, 1);
  remote.invoices.in_meta = {
    id: 'in_meta', livemode: false, status: 'paid', currency: 'usd', amount_paid: 0,
    metadata: { org_id: 'org1' },
  };
  await post(client, { id: 'evt_meta', livemode: false, type: 'charge.refunded', data: { object: { id: 'ch_meta', invoice: 'in_meta' } } });
  remote.subscriptions.sub_other_refund = foreign('sub_other_refund', { metadata: { app: 'other', org_id: 'org1' } });
  remote.invoices.in_foreign_refund = {
    id: 'in_foreign_refund', livemode: false, status: 'paid', currency: 'usd', amount_paid: 0,
    customer: 'cus_test', subscription: 'sub_other_refund', metadata: { org_id: 'org1' },
  };
  await post(client, { id: 'evt_foreign_refund', livemode: false, type: 'charge.refunded', data: { object: { id: 'ch_foreign', invoice: 'in_foreign_refund' } } });
  assert.equal((await client.status('org1')).paidInvoiceCount, 1);
  assert.equal(store.read(s => s.orgs.org2.billing), undefined);
});

test('a completed test checkout is re-read before it grants a plan', async () => {
  const { store, calls, fetchImpl, remote } = harness();
  const client = createTestModeStripeBilling({
    secretKey: 'sk_test_fixture', webhookSecret: secret, priceId: 'price_fixture',
    origin: 'https://app.costcap.dev', store, fetchImpl, now: () => clock, log: () => {},
  });
  const first = await client.checkout({ orgId: 'org1', email: 'owner@example.invalid' });
  const posts = () => calls.filter(c => c.url === 'https://api.stripe.com/v1/checkout/sessions').length;
  assert.equal(posts(), 1);
  const second = await client.checkout({ orgId: 'org1', email: 'owner@example.invalid' });
  assert.equal(second.url, first.url);
  assert.equal(posts(), 1);
  remote.sessions.cs_test.status = 'complete';
  remote.sessions.cs_test.subscription = 'sub_from_checkout';
  remote.subscriptions.sub_from_checkout = { ...sub('sub_from_checkout', 'active'), metadata: { app: 'other', org_id: 'org1' } };
  assert.equal((await client.status('org1')).status, 'free_beta');
  remote.subscriptions.sub_from_checkout = sub('sub_from_checkout', 'active');
  assert.equal((await client.status('org1')).status, 'active');
  assert.equal((await client.status('org1')).amount, null);
});

test('stripe health in test mode stays off the public payload secrets', async () => {
  const service = createHostedServer({
    storePath: join(mkdtempSync(join(tmpdir(), 'cc-test-health-')), 'store.json'),
    origin: 'http://localhost', secureCookies: false, verifyChallenge: async () => true, sendCode: async () => {},
    stripeMode: 'test',
    stripeEnv: {
      COSTCAP_STRIPE_SECRET_KEY: 'sk_test_fixture',
      COSTCAP_STRIPE_WEBHOOK_SECRET: secret,
      COSTCAP_STRIPE_ACCOUNT_ID: 'acct_fixture',
      COSTCAP_STRIPE_PRICE_ID: 'price_fixture',
    },
    billingFactory: async () => ({ status: async () => ({ status: 'free_beta' }), checkout: async () => ({}), portal: async () => ({}), webhook: async () => ({ received: true }) }),
  });
  await service.billingReady;
  await new Promise(r => service.server.listen(0, '127.0.0.1', r));
  try {
    const body = await fetch(`http://127.0.0.1:${service.server.address().port}/api/health/stripe`).then(r => r.json());
    assert.equal(body.stripe, 'ready');
    assert.equal(JSON.stringify(body).includes('sk_test_fixture'), false);
  } finally {
    service.server.closeAllConnections?.();
    service.server.close();
  }
});
