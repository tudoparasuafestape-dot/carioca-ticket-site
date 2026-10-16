'use strict';
// Real local files in ephemeral, offline profiles. No production RPC or purchases.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { installIsolatedNetwork } = require('./safety/isolated-network.cjs');
const ROOT = path.resolve(__dirname, '..'), ORIGIN = 'http://127.0.0.1:4193';
const ROUTE = '/demonstracao/roda-de-samba/';
const OUT = path.join(ROOT, 'test-results/demonstration');
const ADDRESS = 'Vevets Recepções, Rua Arenópolis, 82 - Candeias, Jaboatão dos Guararapes, PE, Brasil';
const MAP = 'https://maps.google.com/maps?output=embed&q=' + encodeURIComponent(ADDRESS);
const UBER_DESTINATION = {
  latitude: -8.1932272,
  longitude: -34.9293376,
  addressLine1: 'Vevets Recepções',
  addressLine2: 'Rua Arenópolis, 82, Candeias, Jaboatão dos Guararapes - PE, Brasil'
};
const UBER = 'https://m.uber.com/looking?drop%5B0%5D=' + encodeURIComponent(JSON.stringify(UBER_DESTINATION));
const SAMBA = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const ERA = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
const sources = ['demonstracao/roda-de-samba/index.html', 'assets/demo-event.js', 'assets/demo-event.css'];
const source = sources.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
for (const id of [SAMBA, ERA]) assert(!source.includes(id), 'No real ID in demonstration assets');
assert(!/script\.google|google\.script|publicRpc|ct\w+PROD|\/checkout|\/evento\/?\?|localStorage|sessionStorage|URLSearchParams|location\.search|location\.hash/.test(source));
const localPaths = new Set([ROUTE, '/assets/demo-event.css', '/assets/demo-event.js', '/assets/carioca-ticket-simbolo.png', '/assets/roda-samba-30-anos.webp', '/assets/waze-mark.svg']);
const report = [];
async function fixture(browser, width, query = '', options = {}) {
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', permissions: [], javaScriptEnabled: options.js !== false, viewport: { width, height: 900 } });
  const page = await context.newPage(), errors = [], requests = [];
  let mapAllowed = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    requests.push({ origin: url.origin, path: url.pathname, method: request.method() });
    assert.equal(request.method(), 'GET', 'No POST/payment/form request');
    assert((url.origin === ORIGIN && localPaths.has(url.pathname)) || (mapAllowed && request.url() === MAP), 'Undeclared demo request: ' + url.origin + url.pathname);
  });
  if (options.js !== false) await context.addInitScript(({ copyFails }) => {
    window.__demoAudit = { writes: [], backend: [], copies: [], geolocation: [] };
    const set = Storage.prototype.setItem;
    set.call(localStorage, 'demo-isolation-sentinel', 'unchanged');
    Storage.prototype.setItem = function (...args) { window.__demoAudit.writes.push(args[0]); return set.apply(this, args); };
    window.fetch = function () { window.__demoAudit.backend.push('fetch'); throw new Error('Unexpected fetch'); };
    XMLHttpRequest.prototype.open = function () { window.__demoAudit.backend.push('xhr'); throw new Error('Unexpected XHR'); };
    navigator.sendBeacon = function () { window.__demoAudit.backend.push('beacon'); return false; };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition() { window.__demoAudit.geolocation.push('getCurrentPosition'); throw new Error('Unexpected geolocation'); },
      watchPosition() { window.__demoAudit.geolocation.push('watchPosition'); throw new Error('Unexpected geolocation'); }
    } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { if (copyFails) throw new Error('Synthetic clipboard denial'); window.__demoAudit.copies.push(value); } } });
  }, { copyFails: !!options.copyFails });
  const guard = await installIsolatedNetwork(context, { root: ROOT, origin: ORIGIN, resources: { [MAP]: { contentType: 'text/html', body: '<!doctype html><title>Local map fixture</title><p>Mapa simulado offline</p>' } } });
  await page.goto(ORIGIN + ROUTE + query);
  return { page, context, requests, allowMap() { mapAllowed = true; }, async finish(name) {
    assert.deepEqual(errors, []); assert.equal(guard.state.rpc.length, 0);
    if (options.js !== false) {
      const audit = await page.evaluate(() => ({ ...window.__demoAudit, stored: localStorage.getItem('demo-isolation-sentinel') }));
      assert.deepEqual(audit.writes, []); assert.deepEqual(audit.backend, []); assert.deepEqual(audit.geolocation, []); assert.equal(audit.stored, 'unchanged');
    }
    await context.close(); guard.assertClean();
    report.push({ name, passed: true, requests, forwarded: guard.state.forwarded, rpc: guard.state.rpc.length });
    console.log('PASS ' + name);
  } };
}
async function inspect(page) {
  assert((await page.title()).startsWith('DEMONSTRAÇÃO'));
  assert((await page.locator('.demo-badge').innerText()).includes('DEMONSTRAÇÃO'));
  assert((await page.locator('.demo-notice').innerText()).includes('Não há evento em cartaz'));
  assert.equal(await page.locator('form, input, select, textarea').count(), 0);
  assert(!/portaria|R\$\s*30|comprar agora|garanta seu ingresso/i.test(await page.locator('body').innerText()));
  assert((await page.locator('#directions-title').textContent()).includes('trajeto de exemplo'));
  assert.equal(await page.locator('a[href*="checkout"], a[href*="evento="], a[href*="pedido="], [data-event-id]').count(), 0);
  assert.equal(await page.locator('script').count(), 1);
  assert.equal(await page.locator('script').getAttribute('src'), '/assets/demo-event.js?v=20261016-demo1');
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,follow');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert(csp.includes("connect-src 'none'") && csp.includes("form-action 'none'"));
  const links = await page.locator('a').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), rel: node.rel, target: node.target })));
  for (const link of links) {
    if (link.href.startsWith('https:')) { assert(link.rel.includes('noreferrer')); assert(link.rel.includes('noopener')); assert.equal(link.target, '_blank'); }
    else assert(['/', '#conteudo', '#informacoes', '#como-chegar'].includes(link.href));
  }
  const waze = new URL(await page.locator('#demo-waze').getAttribute('href'));
  assert.equal(waze.origin, 'https://waze.com'); assert.equal(waze.pathname, '/ul');
  assert.equal(waze.searchParams.get('ll'), '-8.1932272,-34.9293376'); assert.equal(waze.searchParams.get('navigate'), 'yes');
  const maps = new URL(await page.locator('#demo-google-maps').getAttribute('href'));
  assert.equal(maps.origin, 'https://www.google.com'); assert.equal(maps.searchParams.get('destination'), ADDRESS);
  const uberLink = page.getByRole('link', { name: 'Abrir destino de exemplo no Uber', exact: true });
  assert.equal(await uberLink.getAttribute('href'), UBER, 'Static URL must preserve encoded accents, spaces, commas and JSON');
  const uber = new URL(await uberLink.getAttribute('href'));
  assert.equal(uber.origin, 'https://m.uber.com'); assert.equal(uber.pathname, '/looking');
  assert.deepEqual([...uber.searchParams.keys()], ['drop[0]'], 'Only public destination; no pickup, product, payment, token or tracking');
  assert.deepEqual(JSON.parse(uber.searchParams.get('drop[0]')), UBER_DESTINATION);
  assert.equal(uber.hash, '');
  assert.equal(await uberLink.getAttribute('aria-describedby'), 'demo-external-note demo-uber-note');
  assert((await page.locator('#demo-uber-note').textContent()).includes('não solicita uma corrida'));
  const box = await uberLink.boundingBox();
  assert(box && box.height >= 48 && box.x >= 0 && box.x + box.width <= page.viewportSize().width, 'Uber touch target stays inside each viewport');
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' }, args: ['--disable-background-networking', '--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  try {
    for (const width of [1440, 390, 320]) {
      for (const query of ['', '?evento=' + SAMBA + '&pedidoId=FAKE&token=FAKE&checkout=1#comprar', '?evento=' + ERA + '&map=https%3A%2F%2Fexample.invalid&lat=0&lon=0&redirect=%2Fcheckout%2F']) {
        const f = await fixture(browser, width, query);
        await inspect(f.page);
        await f.page.locator('.demo-cover img').evaluate(img => img.decode());
        assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(await f.page.locator('iframe').count(), 0);
        assert(f.requests.every(request => request.origin === ORIGIN));
        await f.page.evaluate(() => window.postMessage({ ctMinhaCariocaPost: true, ok: true, resultado: { autorizado: true } }, '*'));
        await inspect(f.page);
        const missing = await f.page.locator('[aria-labelledby], [aria-describedby]').evaluateAll(nodes => nodes.flatMap(node => ['aria-labelledby','aria-describedby'].flatMap(attr => (node.getAttribute(attr) || '').split(/\s+/).filter(id => id && !document.getElementById(id)))));
        assert.deepEqual(missing, []);
        if (!query) {
          await f.page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.body.style.scrollBehavior = 'auto'; window.scrollTo({ top: 0, behavior: 'instant' }); });
          await f.page.screenshot({ path: path.join(OUT, 'demo-' + width + '-viewport.png'), animations: 'disabled' });
          await f.page.screenshot({ path: path.join(OUT, 'demo-' + width + '.png'), fullPage: true, animations: 'disabled' });
          await f.page.locator('#como-chegar').screenshot({ path: path.join(OUT, 'demo-' + width + '-directions.png'), animations: 'disabled' });
        }
        await f.finish('demo ' + width + ' query=' + !!query + ' stays static; no backend or checkout');
      }
      const f = await fixture(browser, width);
      await f.page.locator('a[href="#informacoes"]').click();
      assert.equal(new URL(f.page.url()).hash, '#informacoes');
      await f.page.locator('a[href="#como-chegar"]').click();
      assert.equal(new URL(f.page.url()).hash, '#como-chegar');
      const beforeUber = f.page.url(), beforeRequests = f.requests.length;
      await f.page.locator('#demo-uber').evaluate(link => link.addEventListener('click', event => {
        event.preventDefault(); window.__demoUberClick = link.href;
      }));
      await f.page.locator('#demo-google-maps').focus();
      await f.page.keyboard.press('Tab');
      assert.equal(await f.page.evaluate(() => document.activeElement.id), 'demo-uber');
      assert(await f.page.locator('#demo-uber').evaluate(link => link.matches(':focus-visible') && parseFloat(getComputedStyle(link).outlineWidth) >= 3));
      await f.page.keyboard.press('Enter');
      assert.equal(await f.page.evaluate(() => window.__demoUberClick), UBER);
      assert.equal(f.page.url(), beforeUber); assert.equal(f.context.pages().length, 1);
      assert.equal(f.requests.length, beforeRequests, 'Uber keyboard test never contacts external services');
      await f.page.locator('#demo-copy-address').click();
      assert.deepEqual(await f.page.evaluate(() => window.__demoAudit.copies), [ADDRESS]);
      f.allowMap();
      await f.page.locator('#demo-load-map').click();
      await f.page.frameLocator('#demo-map-frame iframe').getByText('Mapa simulado offline').waitFor();
      assert.equal(f.requests.filter(request => request.origin !== ORIGIN).length, 1);
      assert.equal(await f.page.locator('#demo-map-frame iframe').getAttribute('referrerpolicy'), 'no-referrer');
      await f.page.locator('#demo-hide-map').click();
      assert.equal(await f.page.locator('iframe').count(), 0);
      assert(await f.page.locator('#demo-map-illustration').isVisible());
      assert.equal(await f.page.evaluate(() => document.activeElement.id), 'demo-load-map');
      await f.finish('map opt-in, hide, copy, section navigation and intercepted Uber keyboard activation ' + width);
    }
    const fallback = await fixture(browser, 390, '', { copyFails: true });
    await fallback.page.locator('#demo-copy-address').click();
    assert((await fallback.page.locator('#demo-copy-status').innerText()).includes('selecionado'));
    assert((await fallback.page.evaluate(() => window.getSelection().toString())).includes('Rua Arenópolis'));
    await fallback.finish('clipboard denial preserves selectable public address');
    const noJS = await fixture(browser, 390, '?evento=' + ERA, { js: false });
    await inspect(noJS.page);
    assert(await noJS.page.locator('#demo-load-map').isHidden());
    assert.equal(await noJS.page.locator('iframe').count(), 0);
    await noJS.finish('without JavaScript, labels, information and route links remain available');
  } finally {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ completed: report.length === 14, cases: report }, null, 2));
    await browser.close();
  }
  console.log('PASS ' + report.length + ' isolated demo cases; no forwarded requests or backend RPC.');
})().catch(error => { console.error(error); process.exitCode = 1; });
