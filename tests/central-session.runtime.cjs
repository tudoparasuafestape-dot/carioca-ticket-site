'use strict';

// Execute the actual Central inline script with entirely synthetic browser APIs.
// No browser, real storage, credentials, packages, HTTP, or Google calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'central', 'index.html'));
const scripts = [...source.toString('utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/i.test(match[1]) && match[2].trim());
assert.equal(scripts.length, 1, 'Expected one inline Central script.');
const script = new vm.Script(scripts[0][2], { filename: 'central-inline.js' });
const key = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';
const fixture = JSON.stringify({ token: 'SYNTHETIC_TEST_SESSION_ONLY', expiraEm: '2099-01-01T00:00:00Z' });
const accepted = { ok: true, resultado: { autenticado: true, autorizado: true,
  eventos: [], modulosPermitidosGerais: [], usuario: {} } };

function setup(options = {}) {
  function storage() {
    const data = new Map([['UNRELATED_KEY', 'UNCHANGED']]);
    if (options.saved !== false) data.set(key, options.saved || fixture);
    return { getItem: name => data.get(name) ?? null,
      setItem: (name, value) => data.set(name, String(value)),
      removeItem: name => data.delete(name) };
  }
  const sessionStorage = storage();
  const localStorage = storage();
  const nodes = new Map();
  const listeners = new Map();
  const timers = new Map();
  const allTimers = new Map();
  const submissions = [];
  let nextTimer = 0;
  let nextRequest = 0;

  function element(tag, id = '') {
    const classes = new Set(['central', 'gateDenied'].includes(id) ? ['hidden'] : []);
    const node = { tagName: tag, id, children: [], style: {}, value: '', innerHTML: '',
      textContent: '', attributes: {}, events: {}, removed: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name), toggle(name, value) {
          if (value === undefined) value = !classes.has(name);
          if (value) classes.add(name); else classes.delete(name);
        } },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      appendChild(child) { this.children.push(child); return child; },
      append(...children) { this.children.push(...children); },
      remove() { this.removed = true; },
      addEventListener(name, callback) { this.events[name] = callback; }
    };
    if (tag === 'form') node.submit = function () {
      // Intentionally only an in-memory record. No real DOM/form/network exists.
      const fields = Object.fromEntries(this.children.map(child => [child.name, child.value]));
      submissions.push({ fields, form: this });
      if (options.submitThrows) throw new Error('Synthetic form submission failure');
    };
    return node;
  }
  function byId(id) {
    if (!nodes.has(id)) nodes.set(id, element('div', id));
    return nodes.get(id);
  }
  function noNetwork() { throw new Error('Network access is forbidden in this offline test.'); }
  const modules = [...source.toString('utf8').matchAll(/<a id="([^"]+)"[^>]*data-perm="([^"]+)"/g)]
    .map(match => { const node = byId(match[1]); node.setAttribute('data-perm', match[2]); return node; });
  const document = { body: element('body'), getElementById: byId,
    createElement: tag => element(tag), querySelectorAll: () => modules };
  const window = { crypto: { randomUUID: () => `synthetic-request-${++nextRequest}` },
    addEventListener: (name, callback) => listeners.set(name, callback),
    fetch: noNetwork, XMLHttpRequest: noNetwork, WebSocket: noNetwork };
  const location = { hash: options.hash || '', pathname: '/central/', search: '', href: '',
    replace(value) { this.replacedWith = value; } };
  const context = vm.createContext({ window, document, sessionStorage, localStorage,
    location, history: { replaceState() { location.hash = ''; } }, URLSearchParams,
    crypto: window.crypto, fetch: noNetwork, XMLHttpRequest: noNetwork, WebSocket: noNetwork,
    setTimeout(callback, delay) { const id = ++nextTimer; const timer = { callback, delay };
      timers.set(id, timer); allTimers.set(id, timer); return id; },
    clearTimeout: id => timers.delete(id) });
  script.runInContext(context, { timeout: 1000 });
  return {
    submissions, sessionStorage, localStorage, location, byId,
    activeTimers: () => timers.size,
    liveTransportNodes: () => document.body.children.filter(node => !node.removed).length,
    hasSession: () => sessionStorage.getItem(key) !== null && localStorage.getItem(key) !== null,
    centralHidden: () => byId('central').classList.contains('hidden'),
    timeout() {
      const entry = [...timers].find(([, timer]) => timer.delay === 25000);
      assert.ok(entry, 'Expected the real transport timeout to have been registered.');
      timers.delete(entry[0]); entry[1].callback();
    },
    reply(payload, requestIndex = submissions.length - 1) {
      const request = submissions[requestIndex];
      assert.ok(request);
      listeners.get('message')({ origin: 'https://script.google.com',
        data: { ctMinhaCariocaPost: true, id: request.fields.ctMinhaCariocaRequestId, ...payload } });
    },
    lateTimeout(id) { assert.ok(allTimers.has(id)); allTimers.get(id).callback(); },
    click(id) { assert.equal(typeof byId(id).events.click, 'function');
      byId(id).events.click({ preventDefault() {} }); }
  };
}

test('transport timeout preserves a saved session without opening Central', () => {
  const h = setup(); h.timeout();
  assert.equal(h.centralHidden(), true);
  assert.equal(h.hasSession(), true, 'Transport silence is not an authentication rejection.');
});

test('retry after transport timeout can submit a fresh validation', () => {
  const h = setup(); h.timeout(); h.click('retry');
  assert.equal(h.submissions.length, 2, 'Retry must be able to revalidate the saved session.');
  assert.equal(h.submissions[1].fields.ctMinhaCariocaAction, 'centralRestaurarSessao');
});

test('server envelope failure preserves the saved session and keeps Central closed', () => {
  const h = setup(); h.reply({ ok: false, erro: 'Synthetic temporary service failure' });
  assert.equal(h.centralHidden(), true);
  assert.equal(h.hasSession(), true, 'An envelope failure does not establish invalid credentials.');
});

test('incomplete server response does not erase the saved session', () => {
  const h = setup(); h.reply({ ok: true });
  assert.equal(h.centralHidden(), true);
  assert.equal(h.hasSession(), true, 'Missing response data is not an explicit rejection.');
});

test('explicit authentication rejection still removes the session and denies access', () => {
  const h = setup();
  h.reply({ ok: true, resultado: { autenticado: false, autorizado: false,
    codigo: 'SESSAO_NAO_AUTORIZADA', mensagem: 'Synthetic explicit rejection' } });
  assert.equal(h.hasSession(), false);
  assert.equal(h.centralHidden(), true);
});

test('authenticated and authorized response opens Central and preserves the session', () => {
  const h = setup();
  h.reply({ ok: true, resultado: { autenticado: true, autorizado: true,
    eventos: [], modulosPermitidosGerais: [], usuario: {} } });
  assert.equal(h.hasSession(), true);
  assert.equal(h.centralHidden(), false);
});

test('explicit logout removes the session and submits only the simulated logout', () => {
  const h = setup();
  h.reply({ ok: true, resultado: { autenticado: true, autorizado: true,
    eventos: [], modulosPermitidosGerais: [], usuario: {} } });
  h.click('logout');
  assert.equal(h.hasSession(), false);
  assert.equal(h.submissions.at(-1).fields.ctMinhaCariocaAction, 'centralLogout');
});

for (const [name, result] of [
  ['missing authorization flag', { autenticado: true }],
  ['missing authentication flag', { autorizado: false }],
  ['string flags', { autenticado: 'true', autorizado: 'true' }],
  ['null result', null],
  ['array result', []]
]) {
  test(`incomplete response (${name}) preserves exact storage without granting access`, () => {
    const h = setup(); h.reply({ ok: true, resultado: result });
    assert.equal(h.centralHidden(), true);
    assert.equal(h.sessionStorage.getItem(key), fixture);
    assert.equal(h.localStorage.getItem(key), fixture);
  });
}

test('failed envelope cannot masquerade as an explicit authentication rejection', () => {
  const h = setup();
  h.reply({ ok: false, resultado: { autenticado: false, autorizado: false } });
  assert.equal(h.hasSession(), true);
  assert.equal(h.centralHidden(), true);
});

test('explicit authorization rejection removes the session without changing unrelated keys', () => {
  const h = setup();
  h.reply({ ok: true, resultado: { autenticado: true, autorizado: false } });
  assert.equal(h.hasSession(), false);
  assert.equal(h.centralHidden(), true);
  assert.equal(h.sessionStorage.getItem('UNRELATED_KEY'), 'UNCHANGED');
  assert.equal(h.localStorage.getItem('UNRELATED_KEY'), 'UNCHANGED');
});

test('manual retry validates again and opens Central only after a fresh positive reply', () => {
  const h = setup(); h.timeout(); h.click('retry');
  assert.equal(h.submissions.length, 2);
  assert.equal(h.centralHidden(), true);
  assert.equal(h.submissions[1].fields.token, 'SYNTHETIC_TEST_SESSION_ONLY');
  h.reply(accepted);
  assert.equal(h.centralHidden(), false);
  assert.equal(h.sessionStorage.getItem(key), fixture);
});

test('retry immediately blocks an already rendered Central until it is revalidated', () => {
  const h = setup(); h.reply(accepted);
  assert.equal(h.centralHidden(), false);
  h.click('retry');
  assert.equal(h.centralHidden(), true);
  h.reply({ ok: false, erro: 'Synthetic technical failure' });
  assert.equal(h.centralHidden(), true);
  assert.equal(h.hasSession(), true);
});

test('a superseded success cannot unlock Central during a newer validation', () => {
  const h = setup(); h.click('retry');
  assert.equal(h.submissions.length, 2);
  h.reply(accepted, 0);
  assert.equal(h.centralHidden(), true);
  h.reply(accepted, 1);
  assert.equal(h.centralHidden(), false);
});

test('a superseded rejection cannot erase a session accepted by a newer validation', () => {
  const h = setup(); h.click('retry'); h.reply(accepted, 1);
  h.reply({ ok: true, resultado: { autenticado: false, autorizado: false } }, 0);
  assert.equal(h.hasSession(), true);
  assert.equal(h.centralHidden(), false);
});

test('late restore success after logout cannot reopen Central or restore storage', () => {
  const h = setup(); h.click('logout'); h.reply(accepted, 0);
  assert.equal(h.centralHidden(), true);
  assert.equal(h.hasSession(), false);
  assert.equal(h.submissions[1].fields.ctMinhaCariocaAction, 'centralLogout');
});

test('retry and repeated logout cannot start another session while logging out', () => {
  const h = setup(); h.click('logout'); h.click('retry'); h.click('logout');
  assert.equal(h.submissions.length, 2);
  assert.equal(h.hasSession(), false);
  assert.equal(h.centralHidden(), true);
});

test('late timeout from an invalidated attempt cannot hide a newer successful session', () => {
  const h = setup(); h.click('retry'); h.reply(accepted, 1); h.lateTimeout(1);
  assert.equal(h.centralHidden(), false);
  assert.equal(h.hasSession(), true);
});

test('transport settlement removes its form, iframe and timer exactly once', () => {
  const h = setup();
  assert.equal(h.liveTransportNodes(), 2); h.timeout();
  assert.equal(h.liveTransportNodes(), 0);
  assert.equal(h.activeTimers(), 0);
  h.reply(accepted, 0);
  assert.equal(h.centralHidden(), true);
  assert.equal(h.hasSession(), true);
});

test('a synchronous technical submit error preserves storage and shows the blocked retry view', () => {
  const h = setup({ submitThrows: true });
  assert.equal(h.hasSession(), true);
  assert.equal(h.centralHidden(), true);
  assert.equal(h.byId('gateLoading').classList.contains('hidden'), true);
  assert.equal(h.byId('gateDenied').classList.contains('hidden'), false);
  assert.equal(h.liveTransportNodes(), 0);
  assert.equal(h.activeTimers(), 0);
});

test('handoff followed by restore timeout retries the session, never the consumed handoff', () => {
  const h = setup({ hash: '#ct_handoff=SYNTHETIC_HANDOFF_ONLY', saved: false });
  assert.equal(h.submissions[0].fields.ctMinhaCariocaAction, 'centralConsumirHandoff');
  assert.equal(h.location.hash, '');
  h.reply({ ok: true, resultado: { ...accepted.resultado,
    token: 'SYNTHETIC_HANDOFF_SESSION_ONLY', expiraEm: '2099-02-01T00:00:00Z' } }, 0);
  assert.equal(h.submissions[1].fields.ctMinhaCariocaAction, 'centralRestaurarSessao');
  h.timeout(); h.click('retry');
  assert.equal(h.submissions.length, 3);
  assert.equal(h.submissions[2].fields.ctMinhaCariocaAction, 'centralRestaurarSessao');
  assert.equal(h.submissions[2].fields.token, 'SYNTHETIC_HANDOFF_SESSION_ONLY');
  assert.equal(h.submissions.filter(s => s.fields.ctMinhaCariocaAction === 'centralConsumirHandoff').length, 1);
  assert.equal(JSON.parse(h.localStorage.getItem(key)).expiraEm, '2099-02-01T00:00:00Z');
  h.reply(accepted, 2);
  assert.equal(h.centralHidden(), false);
});

test('uncertain handoff is never resubmitted, even if its fragment reappears', () => {
  const h = setup({ hash: '#ct_handoff=SYNTHETIC_HANDOFF_ONLY', saved: false });
  h.timeout(); h.location.hash = '#ct_handoff=SYNTHETIC_HANDOFF_ONLY'; h.click('retry');
  assert.equal(h.submissions.length, 1);
  assert.equal(h.hasSession(), false);
  assert.equal(h.centralHidden(), true);
});

test('late handoff success after logout cannot save its token or start restore', () => {
  const h = setup({ hash: '#ct_handoff=SYNTHETIC_HANDOFF_ONLY', saved: false });
  h.click('logout');
  h.reply({ ok: true, resultado: { ...accepted.resultado,
    token: 'SYNTHETIC_LATE_SESSION_ONLY', expiraEm: '2099-02-01T00:00:00Z' } }, 0);
  assert.equal(h.submissions.length, 2);
  assert.equal(h.hasSession(), false);
  assert.equal(h.centralHidden(), true);
});

test('existing expiration still removes expired storage before any request', () => {
  const h = setup({ saved: JSON.stringify({ token: 'SYNTHETIC_EXPIRED_ONLY', expiraEm: '2000-01-01T00:00:00Z' }) });
  assert.equal(h.hasSession(), false);
  assert.equal(h.submissions.length, 0);
  assert.equal(h.centralHidden(), true);
});

test('restoration does not extend the saved expiration or refresh either stored payload', () => {
  const h = setup();
  h.reply({ ok: true, resultado: { ...accepted.resultado, expiraEm: '2200-01-01T00:00:00Z' } });
  assert.equal(h.sessionStorage.getItem(key), fixture);
  assert.equal(h.localStorage.getItem(key), fixture);
});

test('missing session cannot authenticate or submit a validation request', () => {
  const h = setup({ saved: false });
  assert.equal(h.centralHidden(), true);
  assert.equal(h.submissions.length, 0);
});

test('a successful session without CHECKIN permission cannot request check-in credentials', () => {
  const h = setup();
  h.reply({ ok: true, resultado: { ...accepted.resultado,
    eventos: [{ id: 'SYNTHETIC_EVENT', modulosPermitidos: [] }] } });
  h.click('mCheckin');
  assert.equal(h.submissions.length, 1);
  assert.equal(h.byId('mCheckin').getAttribute('aria-disabled'), 'true');
});

test('late check-in callback after logout cannot navigate using a stale credential', () => {
  const h = setup();
  h.reply({ ok: true, resultado: { ...accepted.resultado,
    eventos: [{ id: 'SYNTHETIC_EVENT', modulosPermitidos: ['CHECKIN'] }] } });
  h.click('mCheckin');
  assert.equal(h.submissions[1].fields.ctMinhaCariocaAction, 'portalRpc');
  h.click('logout');
  h.reply({ ok: true, resultado: { sucesso: true, autorizado: true,
    credencial: 'SYNTHETIC_LATE_CHECKIN_ONLY' } }, 1);
  assert.equal(h.location.href, '');
  assert.equal(h.hasSession(), false);
  assert.equal(h.centralHidden(), true);
});
