import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uiResponse } from '../src/hosted/ui.js';
import { createHostedServer } from '../src/hosted/server.js';
test('same-origin UI assets use CSP and no inline scripts or data HTML injection', () => {
  const html = uiResponse('/');
  assert.match(html.body, /FREE BETA/);
  assert.match(html.body, /Billing is disabled/);
  assert.ok(!/stripe/i.test(html.body));
  assert.match(html.body, /No card. No charges/);
  assert.match(html.body, /Only proxy-routed traffic/);
  assert.ok(html.headers['content-security-policy'].includes("frame-ancestors 'none'"));
  assert.ok(!html.headers['content-security-policy'].includes('unsafe-inline'));
  assert.ok(!/<script(?![^>]*type="application\/ld\+json")[^>]*>[^<]+/.test(html.body));
  const ld = html.body.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
  assert.ok(ld);
  const schema = JSON.parse(ld[1]);
  assert.equal(schema['@context'], 'https://schema.org');
  assert.ok(schema['@graph'].some((n) => n['@type'] === 'WebSite' && n.name === 'CostCap'));
  assert.ok(schema['@graph'].some((n) => n['@type'] === 'SoftwareApplication'));
  assert.match(html.body, /rel="canonical" href="https:\/\/costcap\.dev"/);
  const robots = uiResponse('/robots.txt');
  assert.match(robots.headers['content-type'], /text\/plain/);
  assert.match(robots.body, /User-agent: \*/);
  assert.match(robots.body, /Allow: \//);
  assert.match(robots.body, /Sitemap: https:\/\/costcap\.dev\/sitemap\.xml/);
  assert.match(robots.body, /Disallow: \/v1\//);
  const sitemap = uiResponse('/sitemap.xml');
  assert.match(sitemap.headers['content-type'], /application\/xml/);
  assert.match(sitemap.body, /<urlset/);
  assert.match(sitemap.body, /<loc>https:\/\/costcap\.dev<\/loc>/);
  assert.ok(!sitemap.body.includes('/v1/'));
  assert.ok(!sitemap.body.includes('/health'));
  const js = uiResponse('/assets/app.js').body;
  new Script(js);
  assert.ok(!js.includes('inner' + 'HTML'));
  assert.ok(!js.includes('localStorage'));
  assert.ok(!js.includes('sessionStorage'));
  assert.match(js, /textContent/);
  assert.match(js, /Estimated spend \(UTC\)/);
  assert.equal(uiResponse('/anything'), null);
});
test('UI config returns public site key only, JSON-encoded', () => {
  const key = '</script><script>alert(1)</script>';
  assert.deepEqual(JSON.parse(uiResponse('/ui/config', key).body), { siteKey: key });
  assert.equal(uiResponse('/ui/config', key).headers['content-type'], 'application/json');
});
test('hosted root serves UI; fleet remains protected and assets do not expose secrets', async t => {
  const service = createHostedServer({ storePath: join(mkdtempSync(join(tmpdir(),'cc-ui-')),'data.json'), origin:'http://localhost', turnstileSiteKey:'public-site-key', secureCookies:false, verifyChallenge:async()=>false, sendCode:async()=>assert.fail('must not send') });
  await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
  t.after(()=>{service.server.closeAllConnections();service.server.close()});
  const base='http://127.0.0.1:'+service.server.address().port;
  const root=await fetch(base+'/');assert.equal(root.status,200);assert.match(root.headers.get('content-type'),/text\/html/);assert.match(await root.text(),/Open your workspace/);
  const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Sitemap: http:\/\/localhost\/sitemap\.xml/);
  const sitemap=await fetch(base+'/sitemap.xml');assert.equal(sitemap.status,200);assert.match(await sitemap.text(),/<loc>http:\/\/localhost<\/loc>/);
  assert.deepEqual(await (await fetch(base+'/ui/config')).json(),{siteKey:'public-site-key'});
  const fleet=await fetch(base+'/v1/fleet');assert.equal(fleet.status,401);
  const code=await fetch(base+'/auth/request',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({email:'a@example.invalid',turnstileToken:'bad'})});assert.equal(code.status,403);
  assert.equal((await fetch(base+'/assets/app.js')).status,200);
});

test('test-mode billing page shows no public price', () => {
  const html = uiResponse('/', '', 'https://app.costcap.dev', false, 'test');
  assert.match(html.body, /No public price/);
  assert.equal(html.body.includes('$19'), false);
  assert.match(uiResponse('/').body, /No card\. No charges\./);
  assert.match(uiResponse('/', '', 'https://app.costcap.dev', true).body, /\$19 USD per month/);
});

test('GA4 tag G-P6NP48RRGC installed CSP-clean (issue #53)', () => {
  const html = uiResponse('/');
  // External loader from googletagmanager, same-origin config - no inline script.
  assert.match(html.body, /googletagmanager\.com\/gtag\/js\?id=G-P6NP48RRGC/);
  assert.match(html.body, /\/assets\/ga\.js/);
  const ga = uiResponse('/assets/ga.js');
  assert.ok(ga);
  assert.match(ga.body, /gtag\('config', 'G-P6NP48RRGC'\)/);
  assert.match(html.headers['content-security-policy'], /script-src 'self' [^;]*googletagmanager\.com/);
  assert.match(html.headers['content-security-policy'], /connect-src [^;]*google-analytics\.com/);
  assert.ok(!html.headers['content-security-policy'].includes('unsafe-inline'));
});
