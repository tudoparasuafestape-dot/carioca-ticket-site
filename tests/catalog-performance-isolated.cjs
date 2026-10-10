// Read-only synthetic benchmark. Every request is fulfilled locally or aborted.
// This is not a measurement of Apps Script, production, or a customer's device.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const BASE = 'b3f62f2554bebc7fde65a467358fafc634f18af2';
const ORIGIN = 'http://127.0.0.1:4182';
const OUT = path.join(ROOT, 'test-results/catalog-performance');
const cache = new Map();
function source(variant, file) {
  const key = variant + ':' + file;
  if (!cache.has(key)) {
    const local = variant === 'before' && process.env.CT_CATALOG_BASELINE;
    cache.set(key, variant === 'before' && !local
      ? execFileSync('git', ['show', BASE + ':' + file], { cwd: ROOT })
      : fs.readFileSync(path.join(local || ROOT, file)));
  }
  return cache.get(key);
}
function warmSources() {
  // Avoid charging git-show/process startup to only the first baseline sample.
  const files = ['index.html', 'manifest.webmanifest', ...fs.readdirSync(path.join(ROOT, 'assets')).filter(name => /^(home|public-).+\.(js|css|json)$/.test(name)).map(name => 'assets/' + name)];
  for (const variant of ['before', 'after']) for (const file of files) source(variant, file);
}
function rows(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'SYNTHETIC-' + i, nome: 'Evento sintético ' + i,
    data: '10/10/2027', horario: '18:00', local: 'Local de teste', cidade: i % 2 ? 'Recife' : 'Olinda', uf: 'PE',
    visual: { categoria: i % 2 ? 'Música' : 'Teatro', descricaoCurta: 'Somente uma fixture, sem compra real.', capaUrl: '/__fixture/cover-' + i + '.svg' } }));
}
const cover = '<svg xmlns="http://www.w3.org/2000/svg" width="1882" height="836"><rect width="1882" height="836" fill="#245064"/><text x="100" y="400" font-size="100" fill="white">EVENTO SINTÉTICO</text></svg>';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(browser, variant, count, options = {}) {
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const state = { calls: [], unexpected: [], errors: [], responses: options.responses || [], imageRequests: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    window.__perf = { created: 0, articles: 0, attributes: 0, started: performance.now() };
    document.addEventListener('DOMContentLoaded', () => { window.__perf.domReadyAt = performance.now(); }, { once: true });
    window.addEventListener('message', event => { if (event.data && event.data.ctMinhaCariocaPost && event.data.ok === false) window.__perf.transportErrorAt = performance.now(); });
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (...args) { window.__perf.created++; if (args[0] === 'article') window.__perf.articles++; return create.apply(this, args); };
    const set = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (...args) { if (this.closest && this.closest('#event-feature')) window.__perf.attributes++; return set.apply(this, args); };
    new MutationObserver(() => { if (!window.__perf.cardsAt && document.querySelector('.catalog-card')) window.__perf.cardsAt = performance.now(); }).observe(document, { childList: true, subtree: true });
    Math.random = () => 0;
  });
  if (options.sharePending) await page.addInitScript(() => {
    window.shareCalls = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: payload => { window.shareCalls.push(payload); return new Promise(resolve => { window.releaseShare = resolve; }); } });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN && request.method() === 'GET') {
      if (url.pathname === '/away') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture</title><a href="/">Home</a>' });
      // The unchanged home prefetches this document. Keep it a blank fixture;
      // never load or execute the producer portal in a catalog benchmark.
      if (url.pathname === '/produtor/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Prefetch fixture</title>' });
      if (url.pathname.startsWith('/__fixture/')) {
        state.imageRequests.push(url.pathname);
        if (options.holdThirdCover && url.pathname === '/__fixture/cover-2.svg') await new Promise(resolve => { state.releaseImage = resolve; });
        if (options.imageDelay) await sleep(options.imageDelay);
        return route.fulfill({ status: options.brokenImages ? 404 : 200, contentType: 'image/svg+xml', body: cover });
      }
      // Unchanged decorative images are synthetic too. No production resources.
      if (/\.(png|jpg|webp)$/.test(url.pathname)) return route.fulfill({ contentType: 'image/svg+xml', body: cover });
      if (url.pathname === '/pwa-register.js' || url.pathname.includes('ct-analytics')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^(index\.html|assets\/[a-z0-9-]+\.(?:js|css|json)|manifest\.webmanifest)$/.test(file)) { state.unexpected.push(request.method() + ' ' + url.pathname); return route.abort(); }
      if (options.presentationDelay && file === 'assets/public-i18n.js') await sleep(options.presentationDelay);
      if (options.noRail && file === 'assets/home-event-rail.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
      const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/json';
      try { return route.fulfill({ contentType: type, body: source(variant, file) }); }
      catch (error) { state.errors.push('Missing fixture: ' + file); return route.fulfill({ status: 404, body: '' }); }
    }
    const params = new URLSearchParams(request.postData() || '');
    if (url.origin === 'https://script.google.com' && request.method() === 'POST' && params.get('ctMinhaCariocaAction') === 'publicRpc' && params.get('metodo') === 'ctEventosPublicosListarPROD' && params.get('argsJson') === '[]') {
      assert.deepEqual([...params.keys()].sort(), ['argsJson', 'ctMinhaCariocaAction', 'ctMinhaCariocaRequestId', 'metodo']);
      const call = { start: await page.evaluate(() => performance.now()), method: params.get('metodo') };
      state.calls.push(call);
      if (options.hold) await new Promise(resolve => { state.release = resolve; });
      if (options.rpcDelay) await sleep(options.rpcDelay);
      const result = state.responses.length ? state.responses.shift() : { sucesso: true, eventos: rows(count) };
      const payload = { ctMinhaCariocaPost: true, id: params.get('ctMinhaCariocaRequestId'), ok: !result.transportError, resultado: result };
      call.reply = await page.evaluate(() => performance.now());
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<script>parent.postMessage(' + JSON.stringify(payload).replace(/</g, '\\u003c') + ', "*")</script>' });
    }
    state.unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort();
  });
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  return { page, context, state, async finish() { assert.deepEqual(state.unexpected, []); assert.deepEqual(state.errors, []); await context.close(); } };
}
async function ready(page, count) {
  try {
    await page.waitForFunction(n => document.querySelectorAll('.catalog-card').length === n && document.querySelector('#events-grid').getAttribute('aria-busy') === 'false', count);
  } catch (error) {
    console.error('Synthetic readiness failure', await page.evaluate(expected => ({ expected, count: document.querySelectorAll('.catalog-card').length, busy: document.querySelector('#events-grid').getAttribute('aria-busy'), query: document.querySelector('#event-search-input').value, status: document.querySelector('#catalog-status').textContent, names: Array.from(document.querySelectorAll('.catalog-title'), n => n.textContent) }), count));
    throw error;
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function snapshot(page) { return page.evaluate(() => ({ ...window.__perf })); }
async function filter(page, value) {
  return page.evaluate(value => {
    const start = performance.now(), created = window.__perf.created, articles = window.__perf.articles;
    document.querySelector('#event-search-input').value = value;
    document.querySelector('#event-search-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return { syncMs: performance.now() - start, created: window.__perf.created - created, cardsCreated: window.__perf.articles - articles };
  }, value);
}
async function benchmark(browser, variant, count) {
  const f = await fixture(browser, variant, count, { presentationDelay: 500, rpcDelay: 250, imageDelay: 100 });
  await ready(f.page, count);
  await f.page.locator('.catalog-card').first().locator('img').evaluate(img => img.decode());
  const first = await snapshot(f.page);
  const firstCoverAt = await f.page.evaluate(() => performance.now());
  const initialImageRequests = f.state.imageRequests.length;
  const initialImageSources = await f.page.locator('.catalog-photo img[src]').count();
  const filtered = await filter(f.page, 'Recife');
  await ready(f.page, Math.floor(count / 2));
  const restored = await filter(f.page, '');
  await ready(f.page, count);
  let rotation = null;
  if (count > 1) {
    rotation = await f.page.evaluate(() => {
      const start = performance.now(), before = window.__perf.attributes;
      document.querySelector('#event-rail-next').click();
      return { syncMs: performance.now() - start, attributes: window.__perf.attributes - before };
    });
    await f.page.waitForFunction(() => document.querySelector('#events-grid').dataset.activeIndex === '1');
  }
  assert.equal(f.state.calls.length, 1);
  const result = { variant, count, rpcStartMs: f.state.calls[0].start, rpcReplyMs: f.state.calls[0].reply, cardsAtMs: first.cardsAt, firstCoverAtMs: firstCoverAt, firstCreated: first.created, initialImageRequests, initialImageSources, filtered, restored, rotation, imageRequests: f.state.imageRequests.length };
  await f.finish();
  return result;
}
async function regression(browser) {
  let passed = 0;
  for (const n of [0, 1, 2, 15, 50, 200]) {
    const f = await fixture(browser, 'after', n);
    await ready(f.page, n);
    assert.deepEqual(await f.page.locator('.catalog-card').evaluateAll(nodes => nodes.map(n => n.dataset.eventId)), rows(n).map(e => e.id));
    if (n > 1) {
      assert(f.state.imageRequests.length <= 2, 'Only the initial pair of covers may start before interaction');
      assert.equal(await f.page.locator('.catalog-photo img[src]').count(), 2);
      await f.page.locator('#events-grid').focus(); await f.page.keyboard.press('End');
      assert.equal(await f.page.locator('.catalog-card:not([inert])').getAttribute('data-event-id'), 'SYNTHETIC-' + (n - 1));
      await f.page.locator('.catalog-card:not([inert]) img').evaluate(img => img.decode());
      await f.page.keyboard.press('Home');
      await f.page.keyboard.press('ArrowLeft');
      assert.equal(await f.page.locator('.catalog-card:not([inert])').getAttribute('data-event-id'), 'SYNTHETIC-' + (n - 1));
      await f.page.keyboard.press('Home');
    }
    await filter(f.page, 'Recife'); await ready(f.page, Math.floor(n / 2));
    await filter(f.page, ''); await ready(f.page, n);
    if (n > 5) {
      const unseen = f.page.locator('[data-event-id="SYNTHETIC-5"] img');
      assert.equal(await unseen.getAttribute('src'), null);
      await filter(f.page, 'sintético 5 10/10/2027'); await ready(f.page, 1);
      assert.equal(await unseen.getAttribute('src'), ORIGIN + '/__fixture/cover-5.svg');
      await unseen.evaluate(img => img.decode());
      await filter(f.page, ''); await ready(f.page, n);
    }
    const ids = await f.page.locator('[id]').evaluateAll(nodes => nodes.map(n => n.id));
    assert.equal(new Set(ids).size, ids.length);
    if (n) assert.equal(await f.page.locator('.catalog-card:not([inert])').count(), 1);
    assert.equal(f.state.calls.length, 1);
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await f.finish(); passed++;
  }
  const f = await fixture(browser, 'after', 15);
  await ready(f.page, 15);
  const identity = await f.page.locator('.catalog-card').first().evaluate(node => { node.__retained = true; return node.dataset.eventId; });
  for (let i = 0; i < 3; i++) { await filter(f.page, 'Recife'); await ready(f.page, 7); await filter(f.page, ''); await ready(f.page, 15); }
  assert.equal(await f.page.locator('[data-event-id="' + identity + '"]').evaluate(node => node.__retained), true);
  for (const locale of ['en-US', 'es', 'zh-Hans', 'pt-BR']) {
    await f.page.locator('#home-language').selectOption(locale, { force: true });
    await ready(f.page, 15);
    assert.equal(await f.page.locator('[data-event-id="' + identity + '"]').evaluate(node => node.__retained === undefined), true);
    const invalid = await f.page.locator('[aria-labelledby]').evaluateAll(nodes => nodes.filter(n => n.getAttribute('aria-labelledby').split(/\s+/).some(id => !document.getElementById(id))).length);
    assert.equal(invalid, 0);
  }
  // Force the existing retry handler to test invalidation even after success.
  f.state.responses.push({ sucesso: true, eventos: rows(15).slice(1) });
  await f.page.locator('#catalog-retry').evaluate(button => button.click()); await ready(f.page, 14);
  await filter(f.page, ''); await ready(f.page, 14);
  assert.equal(await f.page.locator('[data-event-id="SYNTHETIC-0"]').count(), 0);
  f.state.responses.push({ sucesso: true, eventos: rows(15).slice(2) });
  await f.page.goto(ORIGIN + '/away'); await f.page.goto(ORIGIN); await ready(f.page, 13);
  assert.equal(await f.page.locator('[data-event-id="SYNTHETIC-1"]').count(), 0);
  assert.equal(f.state.calls.length, 3);
  assert.equal(await f.page.evaluate(() => Object.keys(localStorage).some(k => /catalog|event/.test(k))), false);
  await f.finish(); passed++;
  const retry = await fixture(browser, 'after', 2, { presentationDelay: 500, responses: [{ transportError: true }, { sucesso: true, eventos: rows(1) }] });
  await retry.page.locator('#catalog-retry').waitFor({ state: 'visible' });
  const rejected = await snapshot(retry.page);
  assert(rejected.transportErrorAt > 0 && rejected.transportErrorAt < rejected.domReadyAt);
  await retry.page.locator('#catalog-retry').click(); await ready(retry.page, 1);
  assert.equal(retry.state.calls.length, 2); await retry.finish(); passed++;
  const missing = await fixture(browser, 'after', 3, { noRail: true, brokenImages: true });
  await ready(missing.page, 3);
  assert.equal(await missing.page.locator('.catalog-actions .btn-primary').count(), 3);
  assert.equal(await missing.page.locator('.catalog-photo img[src]').count(), 3);
  assert.equal(await missing.page.locator('[data-catalog-src]').count(), 0);
  await missing.finish(); passed++;
  const initialFilter = await fixture(browser, 'after', 15, { hold: true });
  await filter(initialFilter.page, 'sintético 5');
  const releaseDeadline = Date.now() + 5000;
  while (!initialFilter.state.release && Date.now() < releaseDeadline) await sleep(10);
  assert.equal(typeof initialFilter.state.release, 'function');
  initialFilter.state.release(); await ready(initialFilter.page, 1);
  assert.equal(await initialFilter.page.locator('.catalog-card').getAttribute('data-event-id'), 'SYNTHETIC-5');
  assert.equal(await initialFilter.page.locator('.catalog-photo img').getAttribute('loading'), 'eager');
  assert.equal(await initialFilter.page.locator('.catalog-title a').getAttribute('id'), 'catalog-event-5-title');
  await initialFilter.finish(); passed++;
  const categoryRows = rows(2); categoryRows[0].visual.categoria = 'Beleza';
  const category = await fixture(browser, 'after', 2, { responses: [{ sucesso: true, eventos: categoryRows }] });
  await ready(category.page, 2);
  await filter(category.page, 'Beauty'); await ready(category.page, 0);
  await category.page.locator('#home-language').selectOption('en-US', { force: true }); await ready(category.page, 1);
  assert.equal(await category.page.locator('.catalog-card').getAttribute('data-event-id'), 'SYNTHETIC-0');
  await category.page.locator('#home-language').selectOption('pt-BR', { force: true }); await ready(category.page, 0);
  await category.finish(); passed++;
  const share = await fixture(browser, 'after', 15, { sharePending: true });
  await ready(share.page, 15);
  await share.page.locator('.catalog-card:not([inert]) [data-public-share="event"] button').click();
  await filter(share.page, 'Recife'); await ready(share.page, 7);
  await filter(share.page, ''); await ready(share.page, 15);
  await share.page.locator('#home-language').selectOption('en-US', { force: true }); await ready(share.page, 15);
  assert.equal(await share.page.locator('#event-rail-next').isDisabled(), true);
  assert.equal(await share.page.evaluate(() => shareCalls.length), 1);
  await share.page.evaluate(() => releaseShare());
  await share.page.waitForFunction(() => !document.querySelector('#event-rail-next').disabled);
  await share.page.locator('#event-rail-next').click();
  assert.equal(await share.page.locator('#events-grid').getAttribute('data-active-index'), '1');
  await share.finish(); passed++;
  const drag = await fixture(browser, 'after', 3); await ready(drag.page, 3);
  async function dragStart() {
    const cover = drag.page.locator('.catalog-card:not([inert]) .catalog-photo');
    await cover.scrollIntoViewIfNeeded(); const box = await cover.boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await drag.page.mouse.move(point.x, point.y); await drag.page.mouse.down(); return point;
  }
  let point = await dragStart();
  await drag.page.mouse.move(point.x - 90, point.y, { steps: 4 });
  await drag.page.mouse.move(point.x + 90, point.y, { steps: 6 });
  await drag.page.mouse.up();
  assert.equal(await drag.page.locator('#events-grid').getAttribute('data-active-index'), '2');
  await drag.page.locator('.catalog-card:not([inert]) img').evaluate(img => img.decode());
  point = await dragStart(); await drag.page.mouse.move(point.x - 90, point.y, { steps: 4 });
  await drag.page.locator('#events-grid').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
  await drag.page.mouse.up();
  assert.equal(await drag.page.locator('#events-grid').getAttribute('data-active-index'), '2');
  assert.equal(await drag.page.locator('.catalog-card:not([inert])').count(), 1);
  assert.equal(drag.page.url(), ORIGIN + '/');
  await drag.finish(); passed++;
  const lateCover = await fixture(browser, 'after', 3, { holdThirdCover: true, brokenImages: true }); await ready(lateCover.page, 3);
  await lateCover.page.locator('#events-grid').focus(); await lateCover.page.keyboard.press('End');
  const loadingCover = lateCover.page.locator('.catalog-card:not([inert])');
  assert.equal(await loadingCover.locator('.catalog-image-fallback').textContent(), await lateCover.page.evaluate(() => CTHome.t('coverLoading')));
  assert.equal(await loadingCover.locator('.catalog-image-fallback').isVisible(), true);
  const coverDeadline = Date.now() + 5000;
  while (!lateCover.state.releaseImage && Date.now() < coverDeadline) await sleep(10);
  assert.equal(typeof lateCover.state.releaseImage, 'function'); lateCover.state.releaseImage();
  await lateCover.page.waitForFunction(() => document.querySelector('.catalog-card:not([inert]) .catalog-image-fallback').textContent === 'Capa indisponível');
  assert.equal(await loadingCover.locator('.catalog-title').textContent(), 'Evento sintético 2');
  assert.equal(await loadingCover.locator('.btn-primary').getAttribute('href'), '/checkout/?evento=SYNTHETIC-2');
  await lateCover.finish(); passed++;
  return passed;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  warmSources();
  const browser = await chromium.launch({ headless: true, ...(process.env.CT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CT_CHROMIUM_EXECUTABLE } : {}) });
  try {
    const report = { baseline: BASE, synthetic: true, completed: false, productionRpc: 0, browser: await browser.version(), cases: [], regressions: 0 };
    for (const count of [1, 15, 50, 200]) for (const variant of ['before', 'after']) {
      report.cases.push(await benchmark(browser, variant, count));
      fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
    }
    report.regressions = await regression(browser);
    for (const count of [15, 50, 200]) {
      const before = report.cases.find(c => c.count === count && c.variant === 'before');
      const after = report.cases.find(c => c.count === count && c.variant === 'after');
      assert.equal(after.filtered.cardsCreated, 0); assert.equal(after.restored.cardsCreated, 0);
      assert(after.restored.created < before.restored.created);
      assert(after.rotation.attributes < before.rotation.attributes);
      assert(after.rpcStartMs < before.rpcStartMs);
      assert(after.initialImageRequests <= 2);
      assert.equal(after.initialImageSources, 2);
    }
    report.completed = true;
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('PASS: isolated catalog benchmark and ' + report.regressions + ' regression groups; zero forwarded requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
