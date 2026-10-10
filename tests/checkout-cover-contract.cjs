'use strict';
// Isolated render contracts: no browser, network, backend, orders or payments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const COVER = 'https://example.invalid/new-event-cover.png';
const POSTER = 'https://example.invalid/new-event-poster.png';
let count = 0;
for (const route of ['checkout', 'checkout-v2']) {
  const html = fs.readFileSync(path.join(root, route, 'index.html'), 'utf8');
  // Parse all inline scripts, then execute only the real catalog renderer.
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
  const start = html.indexOf('function renderCatalog(');
  const end = html.indexOf('function onType(', start);
  assert(start >= 0 && end > start);
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set(['hidden']);
      nodes.set(id, { textContent: '', innerHTML: '', children: [],
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        removeAttribute(k) { delete this[k]; }, appendChild(n) { this.children.push(n); }
      });
    }
    return nodes.get(id);
  }
  const el = new Proxy({}, { get: (_, key) => node(key) });
  const state = { eventId: 'NEW-2026 & próximo', privateFlow: false };
  const ctx = { state, el, document: { createElement: () => ({}) }, queryCampanha: () => '',
    showClosed() { assert.fail('Cover rendering must not close a valid catalog'); } };
  ctx.window=ctx;
  vm.createContext(ctx);
  const uiWrite=html.match(/function checkoutUiWrite\(node,value\)\{[^\n]+\}/);
  assert(uiWrite,'Exact presentation fallback exists');
  vm.runInContext(uiWrite[0]+'\n'+html.slice(start, end), ctx);
  function render(visual) {
    state.catalog = { evento: { nome: 'Próximo evento sintético', local: 'Novo local' }, visual,
      tipos: [{ id: 'NEW-TYPE', nome: 'Ingresso sintético' }] };
    const before = JSON.stringify(state.catalog);
    ctx.renderCatalog();
    assert.equal(JSON.stringify(state.catalog), before, 'Never mutate catalog/financial payload');
    assert.equal(el.eventName.textContent, 'Próximo evento sintético');
    assert(el.eventBack.href.includes(encodeURIComponent(state.eventId)), 'Keep the new event ID');
    assert.equal(el.typeSelect.children.at(-1).value, 'NEW-TYPE');
  }
  function visible(src) {
    assert.equal(el.checkoutCoverImage.src, src);
    assert.equal(el.checkoutCover.classList.contains('hidden'), false);
  }
  function hidden() {
    assert.equal(el.checkoutCoverImage.src, undefined, 'Clear stale image source');
    assert.equal(el.checkoutCoverImage.onerror, null, 'Do not loop after exhausting fallback');
    assert.equal(el.checkoutCover.classList.contains('hidden'), true);
  }
  function test(name, fn) { fn(); count++; console.log('PASS ' + route + ': ' + name); }
  test('new event with poster only', () => { render({ posterUrl: POSTER }); visible(POSTER); });
  test('cover takes precedence', () => { render({ capaUrl: COVER, posterUrl: POSTER }); visible(COVER); });
  test('cover alone remains supported', () => { render({ capaUrl: COVER }); visible(COVER); });
  test('trim whitespace and use poster for blank cover', () => { render({ capaUrl: '  ', posterUrl: '  ' + POSTER + '  ' }); visible(POSTER); });
  test('invalid/non-string cover does not shadow poster', () => { render({ capaUrl: {}, posterUrl: POSTER }); visible(POSTER); });
  test('missing visual clears the previous image', () => { render(); hidden(); });
  test('empty visual has no broken image', () => { render({}); hidden(); });
  test('unloadable/malformed URL advances to poster on browser error', () => {
    render({ capaUrl: 'https://[invalid', posterUrl: POSTER });
    el.checkoutCoverImage.onerror(); visible(POSTER);
  });
  test('two failed URLs hide and clear the image', () => { el.checkoutCoverImage.onerror(); hidden(); });
  test('one failed cover hides cleanly', () => { render({ capaUrl: COVER }); el.checkoutCoverImage.onerror(); hidden(); });
  test('one failed poster hides cleanly', () => { render({ posterUrl: POSTER }); el.checkoutCoverImage.onerror(); hidden(); });
  test('duplicate cover/poster is attempted only once', () => {
    render({ capaUrl: ' ' + COVER, posterUrl: COVER + ' ' }); el.checkoutCoverImage.onerror(); hidden();
  });
  test('a new catalog invalidates the old fallback callback', () => {
    render({ capaUrl: COVER, posterUrl: POSTER }); const oldError = el.checkoutCoverImage.onerror;
    render({ posterUrl: 'https://example.invalid/another-event.png' }); oldError();
    visible('https://example.invalid/another-event.png');
  });
  test('empty rerender invalidates the old fallback callback', () => {
    const oldError = el.checkoutCoverImage.onerror; render({}); oldError(); hidden();
  });
  test('relative image URLs retain existing support', () => { render({ posterUrl: '/assets/new-event.png' }); visible('/assets/new-event.png'); });
  test('inline image URLs retain existing support', () => { render({ capaUrl: 'data:image/png;base64,LOCAL' }); visible('data:image/png;base64,LOCAL'); });
}
console.log('PASS ' + count + ' isolated render contracts; inline syntax valid in both pages.');
