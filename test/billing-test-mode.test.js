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

function harness() {
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'cc-test-mode-')), 'store.json'));
  store.transaction(s => { s.orgs.org1 = { id: 'org1' }; });
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const path = url.replace('https://api.stripe.com/v1', '');
    if (path === '/checkout/sessions') {
      return new Response(JSON.stringify({ id: 'cs_test', livemode: false, url: 'https://checkout.stripe.com/c/pay/test-fixture' }));
    }
    if (path === '/billing_portal/sessions') {
      return new Response(JSON.stringify({ livemode: false, url: 'https://billing.stripe.com/p/session/test-fixture' }));
    }
    return new Response('{}', { status: 404 });
  };
  return { store, calls, fetchImpl };
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
  for (const secretKey of ['sk_live_fixture', 'rk_live_fixture', 'rk_test_fixture', '']) {
    const refused = createTestModeStripeBilling({
      secretKey, webhookSecret: secret, priceId: 'price_fixture', origin: 'https://app.costcap.dev',
      store, fetchImpl, log: m => logs.push(m),
    });
    assert.equal(refused, null);
  }
  assert.equal(calls.length, 0);
  assert.equal(logs.some(line => line.includes('sk_live_') || line.includes('sk_test_')), false);
  const env = {
    COSTCAP_STRIPE_MODE: 'test',
    COSTCAP_STRIPE_SECRET_KEY: 'sk_test_fixture',
    COSTCAP_STRIPE_WEBHOOK_SECRET: secret,
    COSTCAP_STRIPE_ACCOUNT_ID: 'acct_fixture',
    COSTCAP_STRIPE_PRICE_ID: 'price_fixture',
  };
  assert.equal(stripeHealth({ enabled: true, env }).stripe, 'ready');
  assert.equal(stripeHealth({ enabled: true, env: { ...env, COSTCAP_STRIPE_SECRET_KEY: 'sk_live_fixture' } }).stripe, 'misconfigured');
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

test('a signed livemode webhook does not grant a paid plan', async () => {
  const { store, fetchImpl } = harness();
  const client = createTestModeStripeBilling({
    secretKey: 'sk_test_fixture', webhookSecret: secret, priceId: 'price_fixture',
    origin: 'https://app.costcap.dev', store, fetchImpl, now: () => clock, log: () => {},
  });
  const live = {
    id: 'evt_live', livemode: true, type: 'customer.subscription.updated',
    data: { object: { id: 'sub_live', livemode: true, customer: 'cus_live', status: 'active', metadata: { app: 'costcap', org_id: 'org1' }, items: { data: [{ price: { id: 'price_fixture' }, quantity: 1 }] } } },
  };
  const raw = JSON.stringify(live);
  assert.deepEqual(await client.webhook(raw, sign(raw)), { received: true, ignored: true });
  assert.equal((await client.status('org1')).status, 'free_beta');
  assert.equal(store.read(s => s.orgs.org1.billing), undefined);
  const testEvent = {
    id: 'evt_test', livemode: false, type: 'customer.subscription.updated',
    data: { object: { id: 'sub_test', livemode: false, customer: 'cus_test', status: 'active', metadata: { app: 'costcap', org_id: 'org1' }, items: { data: [{ price: { id: 'price_fixture' }, quantity: 1 }] } } },
  };
  const testRaw = JSON.stringify(testEvent);
  assert.equal((await client.webhook(testRaw, sign(testRaw))).received, true);
  assert.equal((await client.status('org1')).status, 'active');
  assert.equal((await client.portal('org1')).url, 'https://billing.stripe.com/p/session/test-fixture');
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
