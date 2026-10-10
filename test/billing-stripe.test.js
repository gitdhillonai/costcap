import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../src/hosted/store.js';
import { createStripeBilling, verifyStripeEvent } from '../src/hosted/billing.js';
const secret = 'whsec_fixture';
const clock = 1800000000000;
const sign = raw => `t=${clock/1000},v1=${createHmac('sha256', secret).update(`${clock/1000}.${raw}`).digest('hex')}`;
function fixture(overrides = {}) {
 const store = openStore(join(mkdtempSync(join(tmpdir(),'cc-stripe-')), 'store.json'));
 store.transaction(s => {s.orgs.org1={id:'org1'};s.orgs.org2={id:'org2'};});
 let calls=[], session={id:'cs_fixture',livemode:true,url:'https://checkout.stripe.com/c/pay/fixture',status:'open',metadata:{app:'costcap',org_id:'org1'},client_reference_id:'org1'},
 sub={id:'sub_fixture',livemode:true,customer:'cus_fixture',status:'active',metadata:{app:'costcap',org_id:'org1'},items:{data:[{price:{id:'price_fixture'},quantity:1}]}};
 const invoice={id:'in_fixture',livemode:true,status:'paid',currency:'usd',amount_paid:100,customer:'cus_fixture',subscription:sub.id};
 const event={id:'evt_fixture',livemode:true,type:'invoice.paid',data:{object:invoice}};
 const objects={ '/account':{id:'acct_fixture',charges_enabled:true,business_profile:{name:'Persoon.ai Inc'}},
 '/prices/price_fixture?expand[]=product':{active:true,livemode:true,currency:'usd',unit_amount:1900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'},product:{active:true,metadata:{app:'costcap'}}}, ...overrides };
 const options={store,secretKey:'rk_live_fixture',webhookSecret:secret,accountId:'acct_fixture',priceId:'price_fixture',origin:'https://app.costcap.dev',now:()=>clock,
 fetchImpl:async(url,opts)=>{const path=url.replace('https://api.stripe.com/v1',''); calls.push({path,...opts});let data=objects[path];
 if(path==='/checkout/sessions')data=session;
 if(path==='/checkout/sessions/cs_fixture')data=session;
 if(path==='/subscriptions/sub_fixture')data=sub;
 if(path==='/events/evt_fixture')data=event;
 if(path==='/invoices/in_fixture')data=invoice;
 if(path==='/billing_portal/sessions')data={url:'https://billing.stripe.com/p/session/fixture'};
 return new Response(JSON.stringify(data),{status:data?200:404});}};
 return {store,options,calls,event,sub,invoice,complete:()=>{session={...session,status:'complete',subscription:sub.id}}};
}
test('Stripe signatures reject altered, expired and test-mode events',()=>{
 const raw=JSON.stringify({id:'evt_fixture',livemode:true});
 assert.equal(verifyStripeEvent(raw,sign(raw),secret,clock).id,'evt_fixture');
 assert.throws(()=>verifyStripeEvent(raw+' ',sign(raw),secret,clock),/signature/);
 assert.throws(()=>verifyStripeEvent(raw,sign(raw),secret,clock+301000),/timestamp/);
 const testRaw=JSON.stringify({id:'evt_test',livemode:false});
 assert.throws(()=>verifyStripeEvent(testRaw,sign(testRaw),secret,clock),/Live/);
});
test('billing fails closed for wrong account, price, metadata, currency and test key',async()=>{
 const f=fixture();await assert.rejects(createStripeBilling({...f.options,secretKey:'sk_test_fixture'}),/Live/);
 for(const account of [{id:'acct_other',charges_enabled:true,business_profile:{name:'Persoon.ai Inc'}},{id:'acct_fixture',charges_enabled:false,business_profile:{name:'Persoon.ai Inc'}},{id:'acct_fixture',charges_enabled:true,business_profile:{name:'Another business'}}]){
 const x=fixture({'/account':account});await assert.rejects(createStripeBilling(x.options),/account readback/);}
 for(const change of [{unit_amount:2000},{currency:'eur'},{livemode:false},{active:false},{recurring:{interval:'year'}},{product:{active:true,metadata:{app:'another'}}}]){
 const x=fixture();const price=await x.options.fetchImpl('https://api.stripe.com/v1/prices/price_fixture?expand[]=product',{}).then(r=>r.json());
 const y=fixture({'/prices/price_fixture?expand[]=product':{...price,...change}});await assert.rejects(createStripeBilling(y.options),/price readback/);}
});
test('checkout uses fixed server price and idempotency, no redirect-based paid claim',async()=>{
 const f=fixture();const b=await createStripeBilling(f.options);const user={orgId:'org1',email:'owner@example.invalid'};
 assert.equal((await b.status('org1')).status,'free_beta');
 await b.checkout(user);await b.checkout(user);
 assert.equal(f.calls.filter(c=>c.path==='/checkout/sessions').length,1);
 const c=f.calls.find(c=>c.path==='/checkout/sessions');assert.ok(c.headers['idempotency-key']);
 const form=new URLSearchParams(c.body);assert.equal(form.get('line_items[0][price]'),'price_fixture');assert.equal(form.get('client_reference_id'),'org1');
 assert.equal((await b.status('org1')).status,'free_beta');
 f.complete();assert.equal((await b.status('org1')).status,'active');
 await assert.rejects(b.checkout(user),/existing subscription/);
 assert.equal((await b.status('org2')).status,'free_beta');
 assert.equal((await b.portal('org1')).url,'https://billing.stripe.com/p/session/fixture');
 await assert.rejects(b.portal('org2'),/No billing customer/);
});
test('signed live event readback stores paid invoices once and uses fresh subscription state',async()=>{
 const f=fixture();const b=await createStripeBilling(f.options);const raw=JSON.stringify(f.event);
 await b.webhook(raw,sign(raw));assert.equal((await b.status('org1')).paidInvoiceCount,1);
 assert.equal((await b.webhook(raw,sign(raw))).duplicate,true);
 assert.equal(f.store.read(s=>s.orgs.org1.billing.invoices.in_fixture.amountPaid),100);
 f.sub.status='canceled';assert.equal((await b.status('org1')).status,'canceled');
});
import { createHostedServer } from '../src/hosted/server.js';
test('billing HTTP routes enforce verified owner and origin; signed webhook is separate',async t=>{
 let code,checkouts=0;
 const origin='http://localhost';
 const service=createHostedServer({storePath:join(mkdtempSync(join(tmpdir(),'cc-billing-http-')),'store.json'),origin,secureCookies:false,
 verifyChallenge:async()=>true,sendCode:async d=>{code=d.code},sendInvite:async()=>{},
 billingFactory:async()=>({status:async()=>({status:'free_beta'}),checkout:async()=>{checkouts++;return {url:'https://checkout.stripe.com/c/pay/fixture'}},portal:async()=>({}),webhook:async(raw,sig)=>{verifyStripeEvent(raw,sig,secret,clock);return {received:true}}})});
 await service.billingReady;await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
 t.after(()=>{service.server.closeAllConnections();service.server.close();});
 const base=`http://127.0.0.1:${service.server.address().port}`;
 const call=async(path,body,cookie,extra={})=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 assert.equal((await call('/billing/checkout',{})).status,401);
 const login=async email=>{const c=await call('/auth/request',{email});return call('/auth/verify',{challengeId:c.body.challengeId,code})};
 const owner=await login('owner@example.invalid');
 assert.equal((await call('/billing/checkout',{},owner.cookie,{origin:'https://evil.invalid',authorization:'Bearer arbitrary'})).status,403);
 assert.equal((await call('/billing/checkout',{},owner.cookie)).status,200);assert.equal(checkouts,1);
 await call('/v1/invitations',{email:'viewer@example.invalid',role:'viewer'},owner.cookie);
 const viewer=await login('viewer@example.invalid');
 assert.equal((await call('/billing/checkout',{},viewer.cookie)).status,403);
 const raw=JSON.stringify({id:'evt_fixture',livemode:true});
 const r=await fetch(base+'/billing/webhook',{method:'POST',headers:{'stripe-signature':sign(raw)},body:raw});assert.equal(r.status,200);
 assert.equal((await fetch(base+'/billing/webhook',{method:'POST',body:raw})).status,400);
});
