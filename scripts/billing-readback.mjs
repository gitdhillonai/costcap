// Read-only Stripe readback using the same startup gate. Prints only pass/fail text, never secret values.
import { createStripeBilling } from '../src/hosted/billing.js';
const e = process.env;
const shape = {
  key_class: /^rk_live_/.test(e.COSTCAP_STRIPE_SECRET_KEY ?? '') ? 'rk_live' : /^sk_live_/.test(e.COSTCAP_STRIPE_SECRET_KEY ?? '') ? 'sk_live' : 'other',
  whsec_prefix_ok: (e.COSTCAP_STRIPE_WEBHOOK_SECRET ?? '').startsWith('whsec_'),
  account_ok: /^acct_/.test(e.COSTCAP_STRIPE_ACCOUNT_ID ?? ''), price_ok: /^price_/.test(e.COSTCAP_STRIPE_PRICE_ID ?? ''),
};
console.log(JSON.stringify(shape));
try {
  await createStripeBilling({ secretKey: e.COSTCAP_STRIPE_SECRET_KEY, webhookSecret: e.COSTCAP_STRIPE_WEBHOOK_SECRET, accountId: e.COSTCAP_STRIPE_ACCOUNT_ID, priceId: e.COSTCAP_STRIPE_PRICE_ID, origin: 'https://app.costcap.dev', store: { },
    fetchImpl: async (url, opts) => { const r = await fetch(url, opts); if (!r.ok) { let c = ''; try { const j = await r.clone().json(); c = (j.error?.code || '') + ' ' + (j.error?.type || '') + ' ' + String(j.error?.message || '').replace(/(sk|rk|whsec)_[A-Za-z0-9_]+/g, '$1_***').slice(0, 160); } catch {} console.log('stripe', opts.method, new URL(url).pathname, r.status, c); } return r; } });
  console.log('READBACK PASS');
} catch (err) { console.log('READBACK FAIL:', String(err.message).replace(/(sk|rk|whsec)_[A-Za-z0-9_]+/g, '$1_***').slice(0, 300)); }
