'use strict';
// Full checkout pages, local assets and synthetic catalog. Never forward requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), ORIGIN = 'http://127.0.0.1:4183';
const EVENT = 'NEW-COVER-2026 & próximo';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=', 'base64');
const ENDPOINTS = new Set(['https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec', 'https://script.google.com/macros/s/AKfycbyhx6mnGJMsgpGmx-C1r6ZUXbrE66-X6Rkusp1ulVOGcDfJfIs-jgysWp1PfkqB1UC3hg/exec']);
const ASSETS = new Set(['/assets/checkout-home-navigation.css', '/assets/checkout-home-navigation.js', '/assets/checkout-commercial-policy.js']);
async function run(browser, routePath, mobile) {
  const context = await browser.newContext({ viewport: { width: mobile ? 320 : 1365, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [], unexpected = [], images = [], held = new Map();
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await context.routeWebSocket('**/*', socket => { unexpected.push('websocket'); socket.close(); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    try {
      if (url.origin === ORIGIN && req.method() === 'GET') {
        if (url.pathname === routePath) {
          let html = fs.readFileSync(path.join(ROOT, routePath.slice(1), 'index.html'), 'utf8');
          // Test-only access to the actual private renderer, preserving the full application.
          assert.equal(html.split('function renderCatalog(){').length, 2);
          html = html.replace('function renderCatalog(){', 'window.__fixtureRenderCover=function(visual){state.catalog.visual=visual;renderCatalog();};\nfunction renderCatalog(){');
          return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
        }
        if (ASSETS.has(url.pathname)) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join(ROOT, url.pathname)) });
        if (['/pwa-register.js', '/assets/ct-analytics.js'].includes(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: '// Fixture: no telemetry or service workers' });
        if (url.pathname === '/manifest.webmanifest') return route.fulfill({ contentType: 'application/manifest+json', body: '{}' });
        if (url.pathname === '/assets/carioca-ticket-icon-192.png') return route.fulfill({ contentType: 'image/png', body: PNG });
        if (url.pathname.startsWith('/fixture/')) {
          images.push(url.pathname);
          if (url.pathname.includes('held')) { held.set(url.pathname, route); return; }
          if (url.pathname.includes('bad')) return route.fulfill({ status: 404, contentType: 'image/png', body: 'invalid image' });
          return route.fulfill({ contentType: 'image/png', body: PNG });
        }
        throw Error('Unknown local fixture: ' + url.pathname);
      }
      assert(ENDPOINTS.has(req.url()) && req.method() === 'POST', 'Unknown destination');
      const fields = new URLSearchParams(req.postData() || '');
      assert.equal(fields.get('ctMinhaCariocaAction'), 'publicRpc');
      assert.equal(fields.get('metodo'), 'ctCheckoutPublicoCarregarEventoPROD', 'No payment/order RPC allowed');
      assert.deepEqual(JSON.parse(fields.get('argsJson')), routePath === '/checkout-v2/' ? [EVENT, ''] : [EVENT]);
      const catalog = { sucesso: true, evento: { id: EVENT, nome: 'Próximo evento sintético' }, visual: { posterUrl: ORIGIN + '/fixture/poster.png' }, identidadeCliente: { emailObrigatorio: false }, tipos: [{ id: 'LOCAL-TYPE', nome: 'Ingresso sintético', lotes: [] }] };
      const response = JSON.stringify({ ctMinhaCariocaPost: true, id: fields.get('ctMinhaCariocaRequestId'), ok: true, resultado: catalog }).replace(/</g, '\\u003c');
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><script>window.top.postMessage(' + response + ',"*")</script>' });
    } catch (error) { unexpected.push(error.message); console.error('Blocked fixture request:', req.method(), url.origin + url.pathname, error.message); await route.abort('blockedbyclient'); }
  });
  const render = visual => page.evaluate(visual => window.__fixtureRenderCover(visual), visual);
  async function shown(file) {
    await page.waitForFunction(file => { const img = document.getElementById('checkoutCoverImage'); return img.getAttribute('src') === file && img.complete && img.naturalWidth > 0 && !document.getElementById('checkoutCover').classList.contains('hidden'); }, file);
  }
  async function hidden() {
    await page.waitForFunction(() => !document.getElementById('checkoutCoverImage').hasAttribute('src') && document.getElementById('checkoutCover').classList.contains('hidden'));
  }
  async function settle() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  await page.goto(ORIGIN + routePath + '?evento=' + encodeURIComponent(EVENT), { waitUntil: 'domcontentloaded' });
  await page.locator('#typeSelect option[value="LOCAL-TYPE"]').waitFor({ state: 'attached' });
  await shown(ORIGIN + '/fixture/poster.png');
  assert.equal(await page.locator('#eventName').textContent(), 'Próximo evento sintético');
  assert((await page.locator('#eventBack').getAttribute('href')).includes(encodeURIComponent(EVENT)));
  await render({ capaUrl: '/fixture/cover.png', posterUrl: '/fixture/poster.png' }); await shown('/fixture/cover.png');
  await render({ capaUrl: '  ', posterUrl: ' /fixture/poster.png ' }); await shown('/fixture/poster.png');
  await render({ capaUrl: 'https://[invalid', posterUrl: '/fixture/poster.png' }); await shown('/fixture/poster.png');
  await render({ capaUrl: '/fixture/bad-cover.png', posterUrl: '/fixture/poster.png' }); await shown('/fixture/poster.png');
  await render({ capaUrl: '/fixture/bad-cover.png', posterUrl: '/fixture/bad-poster.png' }); await hidden();
  await render({}); await hidden();
  await render({ capaUrl: '/fixture/cover.png' }); await shown('/fixture/cover.png');
  await render({}); await hidden();
  const dup = '/fixture/bad-duplicate.png';
  await render({ capaUrl: dup, posterUrl: dup }); await hidden();
  assert.equal(images.filter(p => p === dup).length, 1);
  // Real in-flight image requests: render a newer catalog before the old HTTP error arrives.
  // This exercises Chromium's image request/event cancellation, not a saved callback invocation.
  for (const mode of ['error-after-success', 'error-after-clear', 'error-while-new-pending']) {
    const old = '/fixture/held-old-' + mode + '.png', fresh = '/fixture/held-new-' + mode + '.png';
    await render({ capaUrl: old, posterUrl: '/fixture/old-poster-must-not-load.png' });
    for (let i = 0; !held.has(old) && i < 100; i++) await page.waitForTimeout(10);
    assert(held.has(old), 'Old real image request is in flight');
    if (mode === 'error-after-clear') await render({});
    else if (mode === 'error-while-new-pending') await render({ capaUrl: fresh, posterUrl: '/fixture/new-poster-must-not-load.png' });
    else { await render({ capaUrl: '/fixture/new-cover.png' }); await shown('/fixture/new-cover.png'); }
    await held.get(old).fulfill({ status: 404, contentType: 'image/png', body: 'Old image failure' }).catch(error => { if (!/closed|handled|invalid interception/i.test(error.message)) throw error; });
    await settle();
    if (mode === 'error-after-clear') await hidden();
    else if (mode === 'error-while-new-pending') {
      for (let i = 0; !held.has(fresh) && i < 100; i++) await page.waitForTimeout(10);
      assert(held.has(fresh));
      assert.equal(await page.locator('#checkoutCoverImage').getAttribute('src'), fresh);
      await held.get(fresh).fulfill({ contentType: 'image/png', body: PNG }); await shown(fresh);
    } else await shown('/fixture/new-cover.png');
  }
  assert(!images.some(p => p.includes('must-not-load')), 'Stale failures must not trigger either catalog fallback');
  await render({ posterUrl: '/fixture/poster.png' }); await shown('/fixture/poster.png');
  if (process.env.CT_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.CT_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.CT_EVIDENCE_DIR, routePath.replaceAll('/', '') + (mobile ? '-mobile' : '-desktop') + '.png'), fullPage: true });
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('PASS ' + routePath + ' ' + (mobile ? 'mobile' : 'desktop') + ': cover/poster/error/clear/duplicates and three real in-flight rerender races; zero unapproved requests');
  await context.close();
}
(async () => { const browser = await chromium.launch(); try { for (const route of ['/checkout/', '/checkout-v2/']) for (const mobile of [false, true]) await run(browser, route, mobile); } finally { await browser.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
