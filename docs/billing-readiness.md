# Hosted billing release gate

Price decision: $19 USD per workspace each month. The local CLI remains free.
This matches the existing product-spec price, avoids per-seat surprises, and
keeps a small-team decision small. This is a pricing hypothesis, not evidence
of demand. Existing beta features remain available without payment. Until a
clear paid-only benefit is verified, position payment as an optional hosted
workspace plan supporting the service, not as features unavailable to free users.

The default image still has no billing routes. Enable only after configuring:
COSTCAP_BILLING=enabled, COSTCAP_STRIPE_SECRET_KEY,
COSTCAP_STRIPE_WEBHOOK_SECRET, COSTCAP_STRIPE_ACCOUNT_ID,
COSTCAP_STRIPE_PRICE_ID. Store secrets only in secure deployment settings.

Startup must verify the live account is the configured Persoon.ai Inc account,
charges are enabled, and the active live price is USD 1900, monthly, licensed,
interval_count=1. Product metadata must contain app=costcap. This gate may fail
when the account's business_profile.name differs from its legal name. Inspect
real account readback and update the identity check, never bypass it.

Webhook endpoint: https://app.costcap.dev/billing/webhook
Events: checkout.session.completed, checkout.session.async_payment_succeeded,
customer.subscription.created, customer.subscription.updated,
customer.subscription.deleted, invoice.paid.
Success: https://app.costcap.dev/?checkout=returned
Cancel: https://app.costcap.dev/?checkout=canceled
Portal return: https://app.costcap.dev/

Readback, not a redirect, establishes subscription state. Checkout has a
persisted idempotency key; concurrent attempts reuse the same Stripe session.
Signed live events are deduplicated and re-read from the account. Subscription
state is fetched fresh to avoid stale webhook order changing status. Invoice
payments are stored by invoice ID with their actual paid amount. This is gross
paid invoice evidence, not net revenue: refunds, disputes and fees require
Stripe reporting. Free/zero invoices do not count as paid invoices.

Release acceptance still required:
- fresh hosted login through production Turnstile + email;
- deployed CLI enrollment, policy sync and receipt sync;
- public source checkout/release available without private credentials;
- startup account/price readback evidence;
- live checkout and signed webhook proof on the permitted $1 test path;
- portal cancellation proof and cancellation of any test renewal;
- mobile and desktop screenshot checks of the optional plan UI;
- no claim of real customer demand from an owner's smoke payment.

Do not turn on paid acquisition or send outreach before these gates pass.
No $19 owner test charge is authorized here. Use a separately approved,
restricted $1 promotion code at Checkout or test mode without changing the standard price readback.

Existing constraints: single-process file datastore, no high availability,
no guaranteed remote kill during disconnection, no provider-bill guarantee.
