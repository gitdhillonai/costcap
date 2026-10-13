import test from 'node:test';
import assert from 'node:assert/strict';
import { uiResponse } from '../src/hosted/ui.js';
import { PUBLIC_ROUTES, jsonLd, robotsTxt, sitemapXml, absoluteUrl } from '../src/hosted/seo.js';

test('public allowlist is only the landing; discovery files omit private routes', () => {
  assert.deepEqual(PUBLIC_ROUTES.map((r) => r.path), ['/']);
  const robots = robotsTxt('https://costcap.dev');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/costcap\.dev\/sitemap\.xml$/m);
  assert.match(robots, /^Disallow: \/auth\/$/m);
  assert.match(robots, /^Disallow: \/v1\/$/m);
  assert.match(robots, /^Disallow: \/api\/health\/$/m);
  const xml = sitemapXml('https://costcap.dev', '2026-10-09');
  assert.match(xml, /<loc>https:\/\/costcap\.dev<\/loc>/);
  for (const loc of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.ok(PUBLIC_ROUTES.some((r) => absoluteUrl('https://costcap.dev', r.path) === loc[1]));
  }
  assert.ok(!xml.includes('/auth'));
  assert.ok(!xml.includes('/v1'));
  assert.ok(!xml.includes('/health'));
  const graph = jsonLd('https://costcap.dev')['@graph'];
  assert.ok(graph.some((n) => n['@type'] === 'WebSite' && n.url === 'https://costcap.dev'));
  assert.ok(graph.some((n) => n['@type'] === 'SoftwareApplication' && n.name === 'CostCap'));
});

test('IndexNow key file is served as exactly the key, text/plain', () => {
  const k = '8459b118d7f227de932db7f94357f430';
  const r = uiResponse(`/${k}.txt`);
  assert.equal(r.body, k);
  assert.match(r.headers['content-type'], /^text\/plain/);
  assert.equal(uiResponse('/other-key.txt'), null);
});
