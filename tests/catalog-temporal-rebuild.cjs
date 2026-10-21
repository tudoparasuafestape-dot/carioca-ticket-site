'use strict';

// Dependency-free runtime regression tests. All transport and time are local
// fakes: executing this suite cannot contact the backend or production site.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clockSource = source('assets/public-catalog-clock.js');
const catalogSource = source('assets/public-event-catalog.js');
const BASE = Date.parse('2026-10-17T12:00:00.000Z');
const iso = n => new Date(n).toISOString();
const envelope = (extra = {}) => ({ temporalVersion: 1, temporalEvaluatedAt: iso(BASE), serverNow: iso(BASE), nextTransitionAt: null, validUntil: iso(BASE + 300000), ...extra });
const canonical = (id, end, extra = {}) => ({ id, nome: id, data: '01/01/1900', horario: '00:00', visual: { categoria: 'Música' }, temporal: { state: 'TEMPORAL_V1', inicioEm: iso(BASE - 60000), fimEm: iso(end), fusoHorario: 'America/Sao_Paulo', temporalVersion: 1 }, ...extra });
const legacy = id => ({ id, nome: id, data: '01/01/1900', horario: '00:00', visual: {}, temporal: { state: 'LEGADO_SEM_FIM', inicioEm: null, fimEm: null, fusoHorario: null, temporalVersion: null } });
const publicResult = (events, extra = {}) => ({ sucesso: true, eventos: events, ...envelope(), ...extra });
let assertions = 0;
function check(fn) { fn(); assertions += 1; }

function clockHarness() {
  let time = 0;
  const context = { window: { performance: { now: () => time } }, Intl, Date, Number };
  vm.runInNewContext(clockSource, context);
  return { C: context.window.CTPublicCatalogClock, set: value => { time = value; } };
}

function testClock() {
  const { C, set } = clockHarness();
  check(() => assert.equal(C.parseInstant('2026-10-17T09:00:00-03:00'), BASE));
  for (const invalid of ['2026-02-30T00:00:00Z', '2026-10-17T24:00:00Z', '2026-10-17T12:00:00', '17/10/2026', null, BASE]) {
    check(() => assert.ok(Number.isNaN(C.parseInstant(invalid))));
  }
  let clock = C.create(envelope(), { requestedAt: 0, receivedAt: 0 });
  check(() => assert.equal(clock.valid, true));
  check(() => assert.equal(clock.legacy, false));
  set(299999); check(() => assert.equal(clock.expired(), false));
  set(300000); check(() => assert.equal(clock.expired(), true));
  check(() => assert.equal(clock.remaining(), 0));
  set(0);
  for (const bad of [
    { temporalVersion: 1 }, envelope({ temporalVersion: 2 }),
    envelope({ temporalEvaluatedAt: iso(BASE + 1) }),
    envelope({ validUntil: iso(BASE) }),
    envelope({ nextTransitionAt: 'invalid' }),
    envelope({ nextTransitionAt: iso(BASE + 100), validUntil: iso(BASE + 101) }),
    envelope({ nextTransitionAt: iso(BASE - 1) })
  ]) {
    clock = C.create(bad);
    check(() => assert.equal(clock.valid, false));
    check(() => assert.equal(clock.expired(), true));
  }
  set(400);
  clock = C.create(envelope(), { requestedAt: 100, receivedAt: 350 });
  check(() => assert.equal(clock.now(), BASE + 300));
  check(() => assert.equal(clock.remaining(), 299700));
  check(() => assert.equal(C.create(envelope(), { requestedAt: 0, receivedAt: 401 }).valid, false));
  check(() => assert.equal(C.create(envelope(), { requestedAt: 400, receivedAt: 399 }).valid, false));
  set(1000);
  clock = C.create(envelope(), { maxAgeMs: 15000 });
  set(15999); check(() => assert.equal(clock.expired(), false));
  set(16000); check(() => assert.equal(clock.expired(), true));
  set(20000); clock = C.create(envelope());
  set(19999); check(() => assert.equal(clock.expired(), true));
  check(() => assert.equal(clock.valid, false));
  set(0); clock = C.create({});
  check(() => assert.equal(clock.legacy, true));
  check(() => assert.ok(Number.isNaN(clock.now())));
  set(1e9); check(() => assert.equal(clock.expired(), false));
  set(0); clock = C.create({}, { legacyMaxAgeMs: 300000 });
  set(300000); check(() => assert.equal(clock.expired(), true));
  set(0); clock = C.create(envelope());
  check(() => assert.equal(C.eventEnd(canonical('future', BASE + 100)), BASE + 100));
  check(() => assert.equal(C.eventEnd(legacy('old label')), null));
  check(() => assert.equal(C.eventEnd({ data: '17/10/2020', horario: '12:00' }), null));
  check(() => assert.ok(Number.isNaN(C.eventEnd(canonical('bad zone', BASE + 100, { temporal: { ...canonical('x', BASE + 100).temporal, fusoHorario: 'Invented/Zone' } })))));
  check(() => assert.equal(clock.isEnded(canonical('end', BASE + 100)), false));
  set(100); check(() => assert.equal(clock.isEnded(canonical('end', BASE + 100)), true));
  // Date.now is deliberately untrustworthy, including a backwards wall jump.
  const originalNow = Date.now;
  try {
    Date.now = () => BASE + 900000000;
    set(0); clock = C.create(envelope());
    Date.now = () => BASE - 900000000;
    set(50); check(() => assert.equal(clock.now(), BASE + 50));
  } finally { Date.now = originalNow; }
  clock.invalidate(); check(() => assert.equal(clock.expired(), true));
  set(0); clock = C.create(envelope({ nextTransitionAt: iso(BASE + 50), validUntil: iso(BASE + 50) }));
  set(49); check(() => assert.equal(clock.expired(), false));
  set(50); check(() => assert.equal(clock.expired(), true));
  set(0); clock = C.create(envelope({ validUntil: iso(BASE + 600000) }));
  check(() => assert.equal(clock.deadline(), BASE + 300000));
  set(500); check(() => assert.equal(C.create(envelope({ validUntil: iso(BASE + 400) }), { requestedAt: 0, receivedAt: 500 }).valid, false));
  check(() => assert.equal(C.create(envelope(), { monotonicNow: () => NaN }).valid, false));
  check(() => assert.equal(C.create(envelope(), { maxAgeMs: 0 }).valid, false));
  check(() => assert.equal(C.create(envelope(), { maxAgeMs: Infinity }).valid, false));
  check(() => assert.ok(Number.isNaN(C.eventEnd({ temporal: { state: 'LEGADO_SEM_FIM', fimEm: iso(BASE) } }))));
  check(() => assert.ok(Number.isNaN(C.eventEnd(canonical('inverted', BASE - 120000)))));

}

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options) {
    const entries = this.listeners.get(type) || [];
    entries.push({ callback, once: !!(options && options.once) }); this.listeners.set(type, entries);
  }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.callback !== callback)); }
  dispatch(type, data = {}) {
    const event = { type, target: this, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...data };
    for (const entry of [...(this.listeners.get(type) || [])]) {
      entry.callback(event);
      if (entry.once) this.removeEventListener(type, entry.callback);
      if (event.stopped) break;
    }
    return event;
  }
}
class Element extends Target {
  constructor(tag, submit) {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.className = ''; this.value = ''; this.hidden = false; this.parentNode = null; this.textContent = '';
    this.classList = { add: cls => { this.className += ' ' + cls; } };
    this.submit = () => submit(this);
  }
  appendChild(child) {
    if (child.tagName === '#FRAGMENT') { for (const item of [...child.children]) this.appendChild(item); return child; }
    child.remove(); child.parentNode = this; this.children.push(child); return child;
  }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  replaceChildren(...children) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  querySelector(selector) {
    if (selector === '.catalog-photo img') return this.descendants().find(el => el.tagName === 'IMG') || null;
    return null;
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  focus() {}
}
function catalogHarness({ delayedMount = false } = {}) {
  let time = 0, nextTimer = 1, uuid = 0;
  const timers = new Map(), requests = [], categories = [];
  const submit = form => { requests.push({ id: form.children.find(input => input.name === 'ctMinhaCariocaRequestId').value }); };
  const document = new Target(), window = new Target();
  const ids = new Map();
  for (const id of ['events-grid', 'catalog-status', 'catalog-status-message', 'catalog-retry', 'event-search-input', 'event-location-input', 'event-search-feedback', 'event-count', 'no-events', 'event-search-form', 'clear-event-search']) ids.set(id, new Element('div', submit));
  document.getElementById = id => ids.get(id);
  document.createElement = tag => new Element(tag, submit);
  document.createDocumentFragment = () => new Element('#fragment', submit);
  document.documentElement = { lang: 'pt-BR' };
  document.body = new Element('body', submit);
  document.readyState = delayedMount ? 'loading' : 'complete'; document.hidden = false;
  window.performance = { now: () => time };
  window.crypto = { randomUUID: () => 'test-' + ++uuid };
  window.CTHome = {
    t: (key, values) => key + (values ? ':' + values.n : ''), sourceLanguage: 'pt-BR',
    filters: { location: null, period: 'all', category: '' }, matches: () => true,
    updateCategories: events => { categories.push(events.map(event => event.id)); },
    categoryLabel: value => ({ text: value, language: 'pt-BR' }), resetFilters() {}
  };
  const context = { window, document, performance: window.performance, crypto: window.crypto, URL, location: { origin: 'https://example.test' }, Intl, Date,
    setTimeout: (fn, delay) => { const id = nextTimer++; timers.set(id, { fn, at: time + Math.max(0, delay) }); return id; },
    clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(clockSource, context);
  vm.runInNewContext(catalogSource, context);
  const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  return {
    document, window, requests, categories, ids, settle,
    set: value => { time = value; },
    response: (index, result) => window.dispatch('message', { origin: 'https://script.google.com', data: { ctMinhaCariocaPost: true, id: requests[index].id, ok: true, resultado: result } }),
    reject: index => window.dispatch('message', { origin: 'https://script.google.com', data: { ctMinhaCariocaPost: true, id: requests[index].id, ok: false } }),
    cardIds: () => ids.get('events-grid').children.map(card => card.dataset.eventId),
    buyLinks: () => ids.get('events-grid').descendants().filter(el => el.href && el.href.startsWith('/checkout/')),
    tick: async value => {
      time = value;
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at);
      for (const [id, timer] of due) if (timers.delete(id)) { timer.fn(); await settle(); }
    }
  };
}

async function testCatalog() {
  // An early rejection is shown after mounting. Initial lifecycle events must
  // not silently consume the next response or replace the explicit retry UI.
  let h = catalogHarness({ delayedMount: true });
  h.reject(0); await h.settle();
  h.set(500); h.document.dispatch('DOMContentLoaded'); await h.settle();
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, false));
  h.window.dispatch('pageshow', { persisted: false }); h.window.dispatch('focus'); await h.settle();
  check(() => assert.equal(h.requests.length, 1));
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, false));
  check(() => assert.deepEqual(h.cardIds(), []));
  h.ids.get('catalog-retry').dispatch('click'); await h.settle();
  check(() => assert.equal(h.requests.length, 2));
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, true));
  h.response(1, { sucesso: true, eventos: [{ id: 'retried', nome: 'Retried' }] }); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['retried']));

  // The existing transport timeout also stays actionable until explicit retry
  // or a real page resume. A late reply from that request cannot regain authority.
  h = catalogHarness(); await h.settle(); await h.tick(18000);
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, false));
  h.window.dispatch('pageshow', { persisted: false }); h.window.dispatch('focus'); await h.settle();
  check(() => assert.equal(h.requests.length, 1));
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, false));
  h.response(0, publicResult([legacy('late-timeout')])); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), []));
  h.ids.get('catalog-retry').dispatch('click'); await h.settle();
  check(() => assert.equal(h.requests.length, 2));
  h.response(1, publicResult([legacy('after-timeout')])); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['after-timeout']));

  h = catalogHarness(); await h.settle();
  h.response(0, publicResult([
    canonical('canonical', BASE + 1000), legacy('legacy'),
    canonical('ended', BASE),
    legacy('EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD'),
    legacy('EVT-23112026-ERA-BEAUTY-EAC4B673')
  ])); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['canonical', 'legacy']));
  check(() => assert.equal(h.buyLinks().length, 2));
  const initialCard = h.ids.get('events-grid').children[0];
  h.window.dispatch('pageshow', { persisted: false }); await h.settle();
  check(() => assert.equal(h.requests.length, 1));
  check(() => assert.equal(h.ids.get('events-grid').children[0], initialCard));
  h.window.dispatch('focus'); await h.settle();
  check(() => assert.equal(h.requests.length, 1));
  check(() => assert.deepEqual(h.cardIds(), ['canonical', 'legacy']));
  await h.tick(999); check(() => assert.equal(h.requests.length, 1));
  await h.tick(1000);
  check(() => assert.deepEqual(h.cardIds(), []));
  check(() => assert.equal(h.buyLinks().length, 0));
  check(() => assert.equal(h.requests.length, 2));
  h.reject(1); await h.settle();
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, false));
  check(() => assert.deepEqual(h.cardIds(), []));
  check(() => assert.deepEqual(Array.from(h.categories.at(-1)), []));

  // A response cannot revive a catalog invalidated by page suspension.
  h = catalogHarness(); await h.settle();
  h.window.dispatch('pagehide'); h.window.dispatch('pageshow'); await h.settle();
  check(() => assert.equal(h.requests.length, 2));
  h.response(1, publicResult([legacy('new')])); await h.settle();
  h.response(0, publicResult([legacy('late')])); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['new']));
  h.set(300000);
  h.window.dispatch('focus'); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), []));
  check(() => assert.equal(h.requests.length, 3));
  h.response(2, publicResult([legacy('focused')])); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['focused']));

  // Legacy presentation survives brief hides without a DOM reset or another
  // request. The unchanged rail retains its own active index and manual pause.
  h = catalogHarness(); await h.settle();
  h.response(0, { sucesso: true, eventos: [{ id: 'legacy-rail', nome: 'Legacy rail' }] }); await h.settle();
  const legacyCard = h.ids.get('events-grid').children[0], categoryRenders = h.categories.length;
  h.ids.get('events-grid').dataset.activeIndex = '1'; legacyCard.manualPauseProbe = true;
  for (const elapsed of [11000, 24000]) {
    h.document.hidden = true; h.document.dispatch('visibilitychange');
    await h.tick(elapsed);
    check(() => assert.equal(h.ids.get('events-grid').children[0], legacyCard));
    h.document.hidden = false; h.document.dispatch('visibilitychange'); await h.settle();
    check(() => assert.equal(h.requests.length, 1));
    check(() => assert.equal(h.ids.get('events-grid').children[0], legacyCard));
    check(() => assert.equal(h.ids.get('events-grid').dataset.activeIndex, '1'));
    check(() => assert.equal(legacyCard.manualPauseProbe, true));
    check(() => assert.equal(h.categories.length, categoryRenders));
  }
  // Legacy freshness is still bounded: expiring in the background revokes
  // links immediately, then waits until visible before requesting a new catalog.
  h.document.hidden = true; h.document.dispatch('visibilitychange');
  await h.tick(300000);
  check(() => assert.equal(h.requests.length, 1));
  check(() => assert.deepEqual(h.cardIds(), []));
  check(() => assert.equal(h.buyLinks().length, 0));
  h.document.hidden = false; h.document.dispatch('visibilitychange'); await h.settle();
  check(() => assert.equal(h.requests.length, 2));
  check(() => assert.deepEqual(h.cardIds(), []));
  h.response(1, { sucesso: true, eventos: [{ id: 'legacy-refreshed', nome: 'Refreshed' }] }); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['legacy-refreshed']));
  h.window.dispatch('pagehide'); h.window.dispatch('pageshow', { persisted: true }); await h.settle();
  check(() => assert.equal(h.requests.length, 3));
  check(() => assert.deepEqual(h.cardIds(), []));

  // A populated canonical page removes links immediately and waits for a new reply.
  h = catalogHarness(); await h.settle();
  h.response(0, publicResult([legacy('before-hide')])); await h.settle();
  h.document.hidden = true; h.document.dispatch('visibilitychange');
  check(() => assert.deepEqual(h.cardIds(), []));
  check(() => assert.equal(h.buyLinks().length, 0));
  check(() => assert.equal(h.requests.length, 1));
  h.document.hidden = false; h.document.dispatch('visibilitychange'); await h.settle();
  check(() => assert.equal(h.requests.length, 2));
  check(() => assert.deepEqual(h.cardIds(), []));
  h.response(1, publicResult([legacy('after-hide')])); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['after-hide']));
  // A persisted pageshow also revalidates if a browser omitted pagehide.
  h.window.dispatch('pageshow', { persisted: true }); await h.settle();
  check(() => assert.equal(h.requests.length, 3));
  check(() => assert.deepEqual(h.cardIds(), []));

  // A hidden page invalidates in-flight authority, including late failures.
  h = catalogHarness(); await h.settle();
  h.document.hidden = true; h.document.dispatch('visibilitychange');
  h.document.hidden = false; h.document.dispatch('visibilitychange'); await h.settle();
  h.response(1, publicResult([legacy('visible')])); await h.settle();
  h.reject(0); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['visible']));
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, true));
  await h.tick(20001);
  check(() => assert.deepEqual(h.cardIds(), ['visible']));

  // Filters and locale re-rendering cannot restore an expired response.
  h.ids.get('event-search-input').value = 'visible';
  h.ids.get('event-search-form').dispatch('submit');
  check(() => assert.deepEqual(h.cardIds(), ['visible']));
  h.set(300000); h.document.dispatch('ct:language'); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), []));
  check(() => assert.equal(h.requests.length, 3));

  // A throttled timer cannot leave a buy link usable at the exact boundary.
  h = catalogHarness(); await h.settle();
  h.response(0, publicResult([canonical('exact', BASE + 100)])); await h.settle();
  h.set(100);
  const click = h.ids.get('events-grid').dispatch('click'); await h.settle();
  check(() => assert.equal(click.prevented, true));
  check(() => assert.equal(click.stopped, true));
  check(() => assert.equal(h.buyLinks().length, 0));
  check(() => assert.equal(h.requests.length, 2));

  h = catalogHarness(); await h.settle();
  h.response(0, publicResult([canonical('middle-click', BASE + 100)])); await h.settle();
  h.set(100);
  const middle = h.ids.get('events-grid').dispatch('auxclick'); await h.settle();
  check(() => assert.equal(middle.prevented, true));
  check(() => assert.equal(h.buyLinks().length, 0));

  // Transport latency consumes authority rather than extending it from receipt.
  h = catalogHarness(); await h.settle(); h.set(500);
  h.response(0, publicResult([legacy('delayed')], { validUntil: iso(BASE + 1000) })); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['delayed']));
  await h.tick(999); check(() => assert.equal(h.requests.length, 1));
  await h.tick(1000); check(() => assert.deepEqual(h.cardIds(), []));

  // No temporal envelope means old behavior, without deriving an end from labels.
  h = catalogHarness(); await h.settle();
  h.response(0, { sucesso: true, eventos: [{ id: 'old-label', nome: 'Legacy', data: '01/01/1900' }] }); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), ['old-label']));
  await h.tick(300000); check(() => assert.equal(h.requests.length, 2));
  check(() => assert.deepEqual(h.cardIds(), []));

  // Malformed envelopes never become a legacy fallback; canonical rows need authority.
  for (const result of [
    { sucesso: true, eventos: [legacy('bad')], temporalVersion: 1 },
    { sucesso: true, eventos: [canonical('no-authority', BASE + 1000)] },
    publicResult([{ id: 'missing-temporal', nome: 'Missing' }]),
    publicResult([canonical('bad-temporal', BASE + 1000, { temporal: { state: 'TEMPORAL_V1' } })])
  ]) {
    h = catalogHarness(); await h.settle(); h.response(0, result); await h.settle();
    check(() => assert.deepEqual(h.cardIds(), []));
    check(() => assert.equal(h.ids.get('catalog-retry').hidden, false));
  }

  // The early transport can finish before DOMContentLoaded: its age is retained.
  h = catalogHarness({ delayedMount: true });
  h.response(0, publicResult([legacy('early')], { validUntil: iso(BASE + 100) }));
  h.set(101); h.document.dispatch('DOMContentLoaded'); await h.settle();
  check(() => assert.deepEqual(h.cardIds(), []));
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, false));

  // Both successful empty and explicit failure responses clear stale navigation.
  h = catalogHarness(); await h.settle(); h.response(0, publicResult([legacy('old')])); await h.settle();
  h.window.dispatch('pagehide'); h.window.dispatch('pageshow', { persisted: true }); await h.settle(); h.response(1, publicResult([])); await h.settle();
  check(() => assert.equal(h.ids.get('catalog-status').hidden, false));
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, true));
  check(() => assert.deepEqual(h.cardIds(), []));
  h.window.dispatch('pagehide'); h.window.dispatch('pageshow', { persisted: true }); await h.settle(); h.response(2, { sucesso: false }); await h.settle();
  check(() => assert.equal(h.ids.get('catalog-retry').hidden, false));
  check(() => assert.equal(h.buyLinks().length, 0));
}

(async () => {
  testClock();
  await testCatalog();
  const html = source('index.html');
  check(() => assert.ok(html.indexOf('/assets/public-catalog-clock.js') < html.indexOf('/assets/public-event-catalog.js')));
  console.log('PASS catalog temporal rebuild: ' + assertions + ' runtime assertions; no network.');
})().catch(error => { console.error(error); process.exitCode = 1; });
