// Offline Chromium integration: no HTTP server, no fixture fallback, no real RPC.
// Every form POST is intercepted before submission; all browser networking is
// disabled and attempted requests fail the test. No software is installed.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.CT_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright'); }
const source = name => readFileSync(new URL('../assets/' + name, import.meta.url), 'utf8');
const CLOCK = source('public-catalog-clock.js'), CATALOG = source('public-event-catalog.js'), RAIL = source('home-event-rail.js');
const BASE = Date.parse('2026-10-13T09:00:00.000Z');
const iso = ms => new Date(BASE + ms).toISOString();
const event = (id, end = 1000, extra = {}) => ({ id, nome: 'Evento ' + id, cidade: 'Recife', uf: 'PE', visual: {}, temporal: { state: 'TEMPORAL_V1', inicioEm: iso(-10000), fimEm: iso(end), fusoHorario: 'America/Recife', temporalVersion: 1 }, ...extra });
const legacy = id => event(id, 0, { temporal: { state: 'LEGADO_SEM_FIM', inicioEm: null, fimEm: null, fusoHorario: null, temporalVersion: null } });
const response = (eventos = [], patch = {}) => ({ sucesso: true, eventos, temporalVersion: 1, serverNow: iso(0), temporalEvaluatedAt: iso(0), validUntil: iso(60000), nextTransitionAt: null, ...patch });
let browser;
before(async () => { browser = await playwright.chromium.launch({ executablePath: process.env.CT_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-background-networking'] }); });
after(async () => { if (browser) await browser.close(); });
async function fixture(t, { rail = false, deferred = false, missingClock = false } = {}) {
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block' });
  const network = [], errors = [];
  await context.route('**/*', route => { network.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(network, [], 'No network, including Google or fixture fallback, may be attempted'); assert.deepEqual(errors, []); });
  await page.setContent(`<!doctype html><html lang="pt-BR"><body><form id="event-search-form"><input id="event-search-input"><input id="event-location-input"></form><button id="clear-event-search"></button><div id="catalog-status"><p id="catalog-status-message"></p><button id="catalog-retry"></button></div><div id="event-search-feedback"></div><div id="event-count"></div><div id="no-events"></div><div id="event-feature"><div id="event-rail-controls"><button id="event-rail-pause"></button><button id="event-rail-previous"></button><button id="event-rail-next"></button><span id="event-rail-position"></span></div><div id="events-grid"></div><div id="event-rail-help"></div><div id="event-rail-motion-note"></div><div id="event-rail-announcement"></div></div></body></html>`);
  await page.evaluate(({ deferred }) => {
    let next = 0;
    const state = window.__test = { now: 0, timers: new Map(), requests: [], hidden: false, loading: deferred, categories: [], matches: 0 };
    Object.defineProperty(performance, 'now', { value: () => state.now });
    Object.defineProperty(document, 'hidden', { get: () => state.hidden });
    Object.defineProperty(document, 'readyState', { get: () => state.loading ? 'loading' : 'complete' });
    window.setTimeout = (fn, delay = 0) => { const id = ++next; state.timers.set(id, { fn, deadline: state.now + Math.max(0, Number(delay)) }); return id; };
    window.clearTimeout = id => state.timers.delete(id);
    window.requestAnimationFrame = fn => window.setTimeout(fn, 0);
    window.cancelAnimationFrame = window.clearTimeout;
    state.advance = (ms, fire = true) => {
      state.now = ms;
      if (!fire) return;
      let rounds = 0;
      while (true) {
        const due = [...state.timers].filter(([, x]) => x.deadline <= state.now).sort((a, b) => a[1].deadline - b[1].deadline)[0];
        if (!due) break;
        if (++rounds > 100) throw new Error('BUSY_TIMER_LOOP');
        state.timers.delete(due[0]); due[1].fn();
      }
    };
    HTMLFormElement.prototype.submit = function () {
      const fields = Object.fromEntries([...this.querySelectorAll('input')].map(x => [x.name, x.value]));
      if (this.method !== 'post' || fields.metodo !== 'ctEventosPublicosListarPROD' || fields.argsJson !== '[]' || fields.ctMinhaCariocaAction !== 'publicRpc') throw new Error('UNEXPECTED_RPC');
      if (Object.keys(fields).length !== 4) throw new Error('RPC_HAS_UNEXPECTED_DATA');
      state.requests.push(fields.ctMinhaCariocaRequestId);
    };
    const deny = () => { throw new Error('NETWORK_NOT_ALLOWED'); };
    window.fetch = deny; window.XMLHttpRequest = function () { throw new Error('NETWORK_NOT_ALLOWED'); };
    window.WebSocket = function () { throw new Error('NETWORK_NOT_ALLOWED'); };
    window.CTHome = {
      sourceLanguage: 'pt-BR', locale: 'pt-BR', filters: { category: '', location: null, period: 'all' },
      t(key, values) { return this.locale + ':' + key + (values ? ':' + JSON.stringify(values) : ''); },
      matches(item) { state.matches++; return !this.filters.location || item.uf === this.filters.location.uf; },
      updateCategories(items) { state.categories = items.map(x => x.id); },
      resetFilters() { this.filters = { category: '', location: null, period: 'all' }; },
      applyTranslations() {}
    };
    window.matchMedia = () => ({ matches: true, addEventListener() {} });
    window.IntersectionObserver = class { constructor(fn) { this.fn = fn; } observe() { this.fn([{ isIntersecting: true }]); } };
    window.ResizeObserver = class { observe() {} };
  }, { deferred });
  if (!missingClock) await page.addScriptTag({ content: CLOCK });
  await page.addScriptTag({ content: CATALOG });
  if (rail) await page.addScriptTag({ content: RAIL });
  const flush = async () => { await page.evaluate(async () => { await Promise.resolve(); await Promise.resolve(); }); };
  return {
    page,
    async deliver(result, index = -1, origin = 'https://script.google.com') { await page.evaluate(({ result, index, origin }) => { const id = index < 0 ? __test.requests.at(index) : __test.requests[index]; window.dispatchEvent(new MessageEvent('message', { origin, data: { ctMinhaCariocaPost: true, id, ok: true, resultado: result } })); }, { result, index, origin }); await flush(); },
    async advance(ms, fire = true) { await page.evaluate(({ ms, fire }) => __test.advance(ms, fire), { ms, fire }); await flush(); },
    async ids() { return page.locator('.catalog-card').evaluateAll(items => items.map(x => x.dataset.eventId)); },
    async requests() { return page.evaluate(() => __test.requests.length); },
    async status() { return page.locator('#catalog-status-message').textContent(); },
    async signal(name, extra = {}) { await page.evaluate(({ name, extra }) => { if (name === 'visibilitychange') { __test.hidden = extra.hidden; document.dispatchEvent(new Event(name)); } else window.dispatchEvent(name === 'pageshow' ? new PageTransitionEvent(name, extra) : new Event(name)); }, { name, extra }); await flush(); }
  };
}

test('removes an event exactly at >= end without relying on root transition', async t => {
  const f = await fixture(t);
  await f.deliver(response([event('A'), event('B', 60000), legacy('L')]));
  await f.advance(999); assert.deepEqual(await f.ids(), ['A', 'B', 'L']);
  await f.advance(1000); assert.deepEqual(await f.ids(), ['B', 'L']);
  assert.equal(await f.requests(), 1);
  await f.advance(5000); assert.equal(await f.requests(), 2);
  assert.deepEqual(await f.ids(), ['B', 'L'], 'fresh survivors remain during background refresh');
});
test('network duration and deferred mount consume the original request lease', async t => {
  const f = await fixture(t, { deferred: true });
  await f.advance(400, false); await f.deliver(response([event('A'), event('B', 9000)]));
  await f.advance(1200, false);
  await f.page.evaluate(() => { __test.loading = false; document.dispatchEvent(new Event('DOMContentLoaded')); });
  assert.deepEqual(await f.ids(), ['B']);
});
test('root stale in transit is unavailable, not a valid empty catalog', async t => {
  const f = await fixture(t);
  await f.advance(1000, false);
  await f.deliver(response([], { validUntil: iso(1000) }));
  assert.match(await f.status(), /loadError/);
  assert.equal(await f.page.locator('#catalog-retry').isHidden(), false);
  await f.advance(120000); assert.equal(await f.requests(), 1);
});
test('valid empty differs from missing envelope and outage', async t => {
  const f = await fixture(t);
  await f.deliver(response([]));
  assert.match(await f.status(), /emptyCatalog/);
  assert.equal(await f.page.locator('#catalog-retry').isHidden(), true);
  await f.page.locator('#catalog-retry').dispatchEvent('click');
  await f.deliver({ sucesso: true, eventos: [legacy('L')] });
  assert.match(await f.status(), /loadError/); assert.deepEqual(await f.ids(), []);
});
test('legacy stays public, malformed and inconsistent temporal objects fail closed individually', async t => {
  const f = await fixture(t);
  const bad = (id, patch) => event(id, 9000, { temporal: { ...event(id).temporal, ...patch } });
  await f.deliver(response([
    legacy('L'), event('V', 9000), event('Missing', 9000, { temporal: undefined }),
    bad('Overflow', { fimEm: '2026-02-30T12:00:00Z' }), bad('Order', { inicioEm: iso(2000), fimEm: iso(1000) }),
    bad('State', { state: 'TEMPORAL_INCONSISTENTE' }), bad('Version', { temporalVersion: 0 }),
    bad('LegacyPartial', { state: 'LEGADO_SEM_FIM', inicioEm: null }), bad('Zone', { fusoHorario: '' }), bad('ZoneMars', { fusoHorario: 'Mars' }), bad('ZoneOffset', { fusoHorario: 'UTC+3' })
  ]));
  assert.deepEqual(await f.ids(), ['L', 'V']);
  await f.advance(9000); assert.deepEqual(await f.ids(), ['L']);
});
test('late timer is checked synchronously for click, auxclick, keyboard and share actions', async t => {
  for (const kind of ['click', 'auxclick', 'contextmenu', 'dragstart', 'keydown']) {
    const f = await fixture(t);
    await f.deliver(response([event('A'), event('B', 9000)]));
    await f.advance(1000, false);
    const prevented = await f.page.evaluate(kind => {
      const link = document.querySelector('[data-event-id="A"] .event-secondary');
      const e = kind === 'keydown' ? new KeyboardEvent(kind, { key: 'Enter', bubbles: true, cancelable: true }) : new MouseEvent(kind, { bubbles: true, cancelable: true });
      link.dispatchEvent(e); return e.defaultPrevented;
    }, kind);
    assert.equal(prevented, true); assert.deepEqual(await f.ids(), ['B']);
  }
});
test('delayed timer clears expired cards before filtering or locale re-render', async t => {
  const f = await fixture(t);
  await f.deliver(response([event('A'), event('B', 9000)]));
  await f.page.locator('#event-search-input').fill('Evento A');
  await f.advance(1000, false);
  await f.page.locator('#event-search-form').dispatchEvent('submit');
  assert.deepEqual(await f.ids(), []);
  await f.page.evaluate(() => { CTHome.locale = 'en-US'; document.dispatchEvent(new Event('ct:language')); });
  assert.deepEqual(await f.ids(), []);
  assert.equal(await f.page.locator('#event-search-input').inputValue(), 'Evento A');
});
test('resume signals invalidate immediately and discard pre-resume response during first fetch', async t => {
  for (const name of ['focus', 'pageshow', 'visibilitychange']) {
    const f = await fixture(t);
    await f.signal(name, name === 'pageshow' ? { persisted: true } : { hidden: false });
    await f.deliver(response([event('OLD', 9000)]), 0);
    assert.deepEqual(await f.ids(), []);
    await f.advance(5000); assert.equal(await f.requests(), 2);
    await f.deliver(response([event('NEW', 9000)], { serverNow: iso(5000), temporalEvaluatedAt: iso(5000) }), 1);
    assert.deepEqual(await f.ids(), ['NEW']);
    await f.deliver(response([event('OLD', 9000)]), 0);
    assert.deepEqual(await f.ids(), ['NEW']);
  }
});
test('hidden and bfcache resume revoke lease even if monotonic time barely advances', async t => {
  const f = await fixture(t);
  await f.deliver(response([event('A', 9000)]));
  await f.signal('visibilitychange', { hidden: true }); assert.deepEqual(await f.ids(), []);
  await f.advance(4000); assert.equal(await f.requests(), 1);
  await f.signal('visibilitychange', { hidden: false });
  await f.signal('pageshow', { persisted: true });
  await f.signal('focus');
  await f.advance(5000); assert.equal(await f.requests(), 2, 'resume burst is coalesced');
  await f.deliver(response([event('B', 20000)], { serverNow: iso(10000), temporalEvaluatedAt: iso(10000) }));
  assert.deepEqual(await f.ids(), ['B']);
});
test('timeout removes iframe and form and cannot accept late callbacks or busy-retry', async t => {
  const f = await fixture(t);
  await f.advance(18000);
  assert.match(await f.status(), /loadError/);
  assert.equal(await f.page.locator('iframe').count(), 0);
  assert.equal(await f.page.locator('form[method="POST"]').count(), 0);
  await f.deliver(response([event('OLD', 90000)]), 0); assert.deepEqual(await f.ids(), []);
  await f.advance(120000); assert.equal(await f.requests(), 1);
});
test('server clock/evaluated regression fails closed with no auto retry', async t => {
  for (const patch of [{ serverNow: iso(-1), temporalEvaluatedAt: iso(-1) }, { serverNow: iso(10), temporalEvaluatedAt: iso(-1) }]) {
    const f = await fixture(t);
    await f.deliver(response([legacy('A')]));
    await f.page.locator('#catalog-retry').dispatchEvent('click');
    await f.deliver(response([legacy('B')], patch));
    assert.deepEqual(await f.ids(), []); assert.match(await f.status(), /loadError/);
    await f.advance(120000); assert.equal(await f.requests(), 2);
  }
});
test('monotonic regression fails closed and client wall-clock changes have no authority', async t => {
  const f = await fixture(t);
  await f.deliver(response([event('A')]));
  await f.page.evaluate(() => { Date.now = () => -999999999; });
  await f.advance(900); assert.deepEqual(await f.ids(), ['A']);
  await f.page.locator('#event-search-form').dispatchEvent('submit');
  await f.advance(899, false);
  await f.page.locator('#event-search-form').dispatchEvent('submit');
  assert.deepEqual(await f.ids(), []); assert.match(await f.status(), /loadError/);
});
test('a replayed same server snapshot never repopulates an already ended event', async t => {
  const f = await fixture(t);
  const old = response([event('A'), legacy('L')]);
  await f.deliver(old); await f.advance(1000); assert.deepEqual(await f.ids(), ['L']);
  await f.advance(5000); await f.deliver(old);
  assert.deepEqual(await f.ids(), ['L']);
});
test('root next transition revokes entire old response even for legacy events', async t => {
  const f = await fixture(t);
  await f.deliver(response([legacy('L')], { nextTransitionAt: iso(1000) }));
  await f.advance(1000); assert.deepEqual(await f.ids(), []);
  await f.advance(5000); assert.equal(await f.requests(), 2);
});
test('carousel keeps surviving active card and paused state; removed active picks a survivor', async t => {
  const f = await fixture(t, { rail: true });
  await f.deliver(response([event('A', 1000), event('B', 3000), event('C', 10000)]));
  await f.page.locator('#event-rail-next').dispatchEvent('click');
  const active = () => f.page.evaluate(() => { const g = document.getElementById('events-grid'); return g.children[Number(g.dataset.activeIndex)]?.dataset.eventId; });
  assert.equal(await active(), 'B');
  assert.equal(await f.page.locator('#event-rail-pause').getAttribute('data-i18n'), 'railPlay');
  await f.advance(1000); assert.equal(await active(), 'B');
  await f.advance(3000); assert.equal(await active(), 'C');
  assert.equal(await f.page.locator('#event-rail-pause').getAttribute('data-i18n'), 'railPlay');
  await f.advance(5000);
  await f.deliver(response([event('C', 10000), event('D', 15000)], { serverNow: iso(5000), temporalEvaluatedAt: iso(5000) }));
  assert.equal(await active(), 'C');
});
test('refresh preserves query, location, locale and advance-sales gate', async t => {
  const f = await fixture(t);
  await f.page.evaluate(() => { CTHome.locale = 'en-US'; CTHome.filters.location = { uf: 'PE' }; window.CTAdvanceSales = { closed: id => id === 'B', message: 'Closed locally' }; });
  await f.deliver(response([event('A'), event('B', 20000), event('RJ', 20000, { uf: 'RJ' })]));
  await f.page.locator('#event-search-input').fill('Evento B');
  await f.page.locator('#event-search-form').dispatchEvent('submit');
  assert.deepEqual(await f.ids(), ['B']);
  assert.equal(await f.page.locator('[data-event-id="B"] a[href^="/checkout/"]').count(), 0);
  await f.advance(1000); await f.advance(5000);
  await f.deliver(response([event('B', 20000), event('RJ', 20000, { uf: 'RJ' })], { serverNow: iso(5000), temporalEvaluatedAt: iso(5000) }));
  assert.deepEqual(await f.ids(), ['B']);
  assert.equal(await f.page.locator('#event-search-input').inputValue(), 'Evento B');
  assert.match(await f.page.locator('#event-count').textContent(), /^en-US:/);
  assert.equal(await f.page.evaluate(() => CTHome.filters.location.uf), 'PE');
});
test('missing clock is unavailable and makes no catalog request', async t => {
  const f = await fixture(t, { missingClock: true });
  assert.equal(await f.requests(), 0); assert.match(await f.status(), /loadError/);
});
test('untrusted origin cannot populate the home; transport remains public-only', async t => {
  const f = await fixture(t);
  await f.deliver(response([legacy('A')]), 0, 'https://attacker.invalid');
  assert.deepEqual(await f.ids(), []);
  await f.deliver(response([legacy('B')])); assert.deepEqual(await f.ids(), ['B']);
});

test('all ended events produce a valid empty catalog and do not invent legacy deadlines', async t => {
  const f = await fixture(t);
  await f.deliver(response([event('A')]));
  await f.advance(1000);
  assert.deepEqual(await f.ids(), []); assert.match(await f.status(), /emptyCatalog/);
  assert.equal(await f.page.locator('#catalog-retry').isHidden(), true);
});
test('very short valid empty leases are throttled and failure stops subsequent refresh', async t => {
  const f = await fixture(t);
  await f.deliver(response([], { validUntil: iso(1) }));
  await f.advance(1); assert.equal(await f.requests(), 1);
  await f.advance(4999); assert.equal(await f.requests(), 1);
  await f.advance(5000); assert.equal(await f.requests(), 2);
  await f.advance(23000); assert.match(await f.status(), /loadError/);
  await f.advance(999999); assert.equal(await f.requests(), 2);
});
test('pre-mount resume cancels the speculative initial request', async t => {
  const f = await fixture(t, { deferred: true });
  await f.signal('focus');
  await f.deliver(response([event('OLD', 9000)]), 0);
  await f.page.evaluate(() => { __test.loading = false; document.dispatchEvent(new Event('DOMContentLoaded')); });
  assert.equal(await f.requests(), 2); assert.deepEqual(await f.ids(), []);
  await f.deliver(response([event('NEW', 9000)]), 1);
  assert.deepEqual(await f.ids(), ['NEW']);
});
test('pagehide removes all cards immediately and an old response cannot restore them', async t => {
  const f = await fixture(t);
  await f.deliver(response([legacy('A')]));
  await f.signal('pagehide');
  assert.deepEqual(await f.ids(), []);
  await f.advance(5000); assert.equal(await f.requests(), 1, 'pagehide must wait for a resume signal');
  await f.deliver(response([legacy('A')]), 0);
  assert.deepEqual(await f.ids(), []);
});
test('a delayed expiry blocks a share handler before it can use stale event data', async t => {
  const f = await fixture(t);
  await f.deliver(response([event('A')]));
  await f.page.evaluate(() => {
    const button = document.createElement('button'); button.id = 'share-expiry-probe';
    button.addEventListener('click', () => { __test.shared = true; });
    document.querySelector('.catalog-card').appendChild(button);
  });
  await f.advance(1000, false);
  await f.page.locator('#share-expiry-probe').dispatchEvent('click');
  assert.equal(await f.page.evaluate(() => !!__test.shared), false);
  assert.deepEqual(await f.ids(), []);
});
test('early event timer re-arms against the actual remaining deadline', async t => {
  const f = await fixture(t);
  await f.deliver(response([event('A')]));
  await f.page.evaluate(() => {
    __test.now = 900;
    const [id, timer] = [...__test.timers].find(([, x]) => x.deadline === 1000);
    __test.timers.delete(id); timer.fn();
  });
  assert.deepEqual(await f.ids(), ['A']);
  await f.advance(1000); assert.deepEqual(await f.ids(), []);
});
