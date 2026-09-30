'use strict';

/*
 * Standalone, offline harness. Run ONLY with:
 *   node --test tests/e2e/evento-v2-loading-harness.spec.js
 * Uses an already installed playwright (or playwright-core via NODE_PATH).
 * Does not load playwright.config.js, start a server, install dependencies,
 * write reports, or contact the URLs present in the product source.
 * Optional CT_HARNESS_BROWSER: path to an already installed Chromium browser.
 *
 * Product HTML is read verbatim. Exact, fail-closed insertion anchors add only
 * observation calls in memory; no guards, catch blocks, branches, origin rules,
 * timeout values, or render statements are replaced. Form submission and the
 * incoming MessageEvent are synthetic. This is NOT an Apps Script integration
 * test and does not exercise browser-authenticated message origins.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('playwright-core')); }

const sourcePath = path.resolve(__dirname, '../../evento-v2/index.html');
const original = fs.readFileSync(sourcePath, 'utf8');
const localUrl = 'http://127.0.0.1/evento-v2/?evento=EVT-HARNESS';
const mark = name => `window.__loadingHarness.mark('${name}');`;

function observedHtml() {
  let html = original.replace(/\r\n/g, '\n');
  function insertAfter(anchor, observation) {
    assert.equal(html.split(anchor).length, 2, 'Product observation anchor changed');
    html = html.replace(anchor, anchor + '\n' + observation);
  }
  insertAfter('var pending={};',
    'window.__loadingHarness.pendingCount=()=>Object.keys(pending).length;');
  insertAfter('function rpc(method,args,success,failure){', mark('rpc-start'));
  insertAfter('function cleanup(id){', mark('cleanup-start'));
  insertAfter('clearTimeout(p.timer);', mark('cleanup-complete'));
  insertAfter("window.addEventListener('message',function(ev){", mark('message-received'));
  // Observe acceptance after cleanup without modifying the original statement.
  insertAfter('    var p=cleanup(payload.id);', mark('message-accepted'));
  insertAfter('.withSuccessHandler(function(res){', mark('success-start'));
  // This anchor distinguishes the initial failure handler from campaign handlers.
  const failureAnchor = '.withFailureHandler(function(){\n              showError';
  assert.equal(html.split(failureAnchor).length, 2, 'Failure observation anchor changed');
  html = html.replace(failureAnchor, '.withFailureHandler(function(){\n' +
    mark('failure-start') + '\n              showError');
  insertAfter('function render(res){', mark('render-start'));
  insertAfter('} catch (err) {', 'window.__loadingHarness.renderCaught(err);');
  insertAfter('function registrarAcessoCampanha(){', mark('campaign-start'));
  insertAfter("$('mobileBuy').classList.remove('hidden');", mark('render-complete'));
  insertAfter('function showError(msg){', mark('show-error'));
  insertAfter("$('errorBox').classList.remove('hidden');", mark('show-error-complete'));
  // Resource policy belongs to this synthetic document, not to the product file.
  const policy = "default-src 'none'; script-src 'unsafe-inline'; " +
    "style-src 'unsafe-inline'; img-src data:; connect-src 'none'; " +
    "form-action 'none'; frame-src 'none'; base-uri 'none'";
  insertAfter('<head>', `<meta http-equiv="Content-Security-Policy" content="${policy}">`);
  return html;
}

function installObservation() {
  const events = [];
  const timers = new Set();
  const h = window.__loadingHarness = {
    events, submissions: [], exceptions: [], caughtRenderErrors: [], pendingCount: () => -1,
    mark(name) { events.push(name); },
    renderCaught(error) {
      h.caughtRenderErrors.push({ name: error.name, message: error.message });
      h.mark('render-error-caught');
    },
    snapshot() {
      const loading = document.getElementById('loading');
      const visible = Boolean(loading && getComputedStyle(loading).display !== 'none');
      events.push(visible ? 'loading-visible' : 'loading-hidden');
      return {
        events: [...events], exceptions: [...h.exceptions],
        caughtRenderErrors: [...h.caughtRenderErrors],
        pending: h.pendingCount(), activeTimers: timers.size, loadingVisible: visible,
        frames: document.querySelectorAll('iframe').length,
        forms: document.querySelectorAll('form').length,
        submissions: h.submissions.length
      };
    }
  };
  const nativeSet = window.setTimeout.bind(window);
  const nativeClear = window.clearTimeout.bind(window);
  window.setTimeout = function(callback, delay, ...args) {
    if (delay !== 45000) return nativeSet(callback, delay, ...args);
    const timer = nativeSet(function(...callbackArgs) {
      timers.delete(timer);
      h.mark('timer-fired');
      return callback(...callbackArgs);
    }, delay, ...args);
    timers.add(timer);
    h.mark('timer-active');
    return timer;
  };
  window.clearTimeout = function(timer) {
    if (timers.delete(timer)) h.mark('timer-cancelled');
    return nativeClear(timer);
  };
  // Never call native submit: transport replacement, not RPC replacement.
  HTMLFormElement.prototype.submit = function() {
    h.mark('submit-attempted');
    const fields = new FormData(this);
    if (fields.get('ctMinhaCariocaAction') !== 'publicRpc' ||
        fields.get('metodo') !== 'ctEventoPublicoCarregarPROD' ||
        fields.get('argsJson') !== '["EVT-HARNESS"]' ||
        this.method !== 'post' || !this.target || h.pendingCount() !== 1) {
      throw new Error('Unexpected synthetic transport contract');
    }
    h.mark('pending-created');
    h.submissions.push({ id: fields.get('ctMinhaCariocaRequestId') });
  };
  window.addEventListener('error', event => {
    // Expected fixture errors only; no stack, source URL, payload, or token.
    h.exceptions.push({ name: event.error?.name || 'Error', message: event.error?.message || 'error' });
    h.mark('frontend-exception');
    // Do not preventDefault: original exception remains unhandled.
  });
}

function resultFixture() {
  return {
    sucesso: true,
    evento: { id: 'EVT-HARNESS', nome: 'Evento sintético', data: '01/01/2030' },
    visual: { capaUrl: '', posterUrl: '', descricaoCurta: 'Fixture local' },
    menorPreco: 'R$ 10,00',
    tipos: [{ nome: 'Tipo sintético', lotes: [{ nome: 'Lote sintético', precoNumero: 10, preco: 'R$ 10,00' }] }]
  };
}

let browser;
before(async () => {
  const executablePath = process.env.CT_HARNESS_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'
  ].find(candidate => fs.existsSync(candidate));
  browser = await chromium.launch({
    headless: true, ...(executablePath ? { executablePath } : {}),
    // Defense in depth for browser background traffic: no reachable proxy,
    // no direct fallback, no bypass even for loopback. All test resources are fulfilled.
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    args: ['--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--disable-quic', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']
  });
});
after(async () => {
  if (browser) await browser.close();
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), original, 'Product source changed');
});

async function isolated(t, action) {
  const context = await browser.newContext({
    offline: true, serviceWorkers: 'block', acceptDownloads: false,
    baseURL: 'http://127.0.0.1', viewport: { width: 1280, height: 800 }
  });
  const network = { documentsFulfilled: 0, blocked: 0, websocketsBlocked: 0 };
  try {
    // No route.continue/fallback exists. Even unexpected requests cannot leave.
    await context.route('**/*', async route => {
      const request = route.request();
      if (request.url() === localUrl && request.method() === 'GET' &&
          request.isNavigationRequest() && network.documentsFulfilled === 0) {
        network.documentsFulfilled++;
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: observedHtml() });
      }
      network.blocked++;
      await route.abort('blockedbyclient');
    });
    assert.equal(typeof context.routeWebSocket, 'function', 'WebSocket isolation unavailable');
    await context.routeWebSocket('**/*', socket => {
      network.websocketsBlocked++;
      socket.close(); // Never connectToServer.
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push({ name: error.name, message: error.message }));
    const epoch = new Date('2030-01-01T00:00:00Z');
    await page.clock.install({ time: epoch });
    await page.clock.pauseAt(epoch);
    await page.addInitScript(installObservation);
    await page.goto(localUrl, { waitUntil: 'load' });
    assert.equal(new URL(page.url()).hostname, '127.0.0.1');
    const initial = await snapshot(page);
    assert.equal(initial.submissions, 1);
    assert.equal(initial.pending, 1);
    assert.equal(initial.activeTimers, 1);
    assert.equal(initial.loadingVisible, true);
    assert.equal(initial.frames, 1);
    assert.equal(initial.forms, 1);
    for (const phase of ['rpc-start', 'timer-active', 'submit-attempted', 'pending-created']) {
      assert.ok(initial.events.includes(phase), phase);
    }
    await action(page, pageErrors);
    assert.equal(network.documentsFulfilled, 1);
    assert.equal(network.websocketsBlocked, 0);
    const final = await snapshot(page);
    assert.equal(final.pending, 0);
    assert.equal(final.activeTimers, 0);
    assert.equal(final.forms, 0);
    assert.equal(final.frames, 0);
    assert.equal(final.submissions, 1, 'No campaign or analytics submission');
    assert.deepEqual(final.exceptions, pageErrors);
    // Only aggregate synthetic states go to stdout; full event trace stays in memory.
    t.diagnostic(JSON.stringify({ pending: final.pending, activeTimers: final.activeTimers,
      loadingVisible: final.loadingVisible, errors: final.exceptions.map(e => e.name),
      caughtRenderErrors: final.caughtRenderErrors.map(e => e.name), ...network }));
  } finally { await context.close(); }
}

async function snapshot(page) {
  return page.evaluate(() => window.__loadingHarness.snapshot());
}
async function deliver(page, result) {
  await page.evaluate(resultado => {
    const h = window.__loadingHarness;
    const before = h.events.filter(name => name === 'message-accepted').length;
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://script.google.com',
      data: { ctMinhaCariocaPost: true, id: h.submissions[0].id, ok: true, resultado, erro: '' }
    }));
    if (h.events.filter(name => name === 'message-accepted').length === before) h.mark('message-rejected');
  }, result);
}
function ordered(events, expected) {
  let cursor = -1;
  for (const name of expected) {
    const index = events.indexOf(name, cursor + 1);
    assert.ok(index > cursor, `Missing or out-of-order phase: ${name}`);
    cursor = index;
  }
}

test('1 - sucesso imediato: cleanup, render e CTA utilizável', t => isolated(t, async (page, errors) => {
  await deliver(page, resultFixture());
  const state = await snapshot(page);
  ordered(state.events, ['message-received', 'cleanup-start', 'timer-cancelled',
    'cleanup-complete', 'message-accepted', 'success-start', 'render-start', 'render-complete', 'campaign-start']);
  assert.equal(state.events.filter(name => name === 'campaign-start').length, 1);
  assert.deepEqual(state.caughtRenderErrors, []);
  assert.equal(state.loadingVisible, false);
  assert.equal(await page.locator('#app').isVisible(), true);
  assert.equal(await page.locator('#buyHero').getAttribute('href'), '/checkout-v2/?evento=EVT-HARNESS');
  await page.locator('#buyHero').click({ trial: true }); // Actionability without navigation.
  await page.clock.runFor(90000);
  assert.equal((await snapshot(page)).events.includes('timer-fired'), false);
  assert.equal((await snapshot(page)).events.includes('show-error'), false);
  assert.deepEqual(errors, []);
}));

test('2 - sem resposta: timeout de 45000 ms conclui UI de erro', t => isolated(t, async (page, errors) => {
  await page.clock.runFor(44999);
  assert.equal((await snapshot(page)).activeTimers, 1);
  assert.equal((await snapshot(page)).loadingVisible, true);
  await page.clock.runFor(1);
  const state = await snapshot(page);
  ordered(state.events, ['timer-fired', 'cleanup-start', 'cleanup-complete',
    'failure-start', 'show-error', 'show-error-complete']);
  assert.equal(state.events.includes('success-start'), false);
  assert.equal(state.events.includes('message-received'), false);
  assert.equal(state.events.includes('campaign-start'), false);
  assert.deepEqual(state.caughtRenderErrors, []);
  assert.equal(state.loadingVisible, false);
  assert.equal(await page.locator('#errorBox').isVisible(), true);
  assert.match(await page.locator('#errorText').textContent(), /Não foi possível carregar o evento/);
  assert.equal(await page.locator('#app').isVisible(), false);
  assert.deepEqual(errors, []);
}));

async function expectRenderRecovery(page, errors, result, pattern) {
  await deliver(page, result);
  const immediate = await snapshot(page);
  assert.equal(immediate.loadingVisible, false, 'Recovery must not wait for another timer');
  assert.equal(immediate.pending, 0);
  assert.equal(immediate.activeTimers, 0);
  await page.clock.runFor(90000); // Recovery persists without retry or another timeout.
  const state = await snapshot(page);
  ordered(state.events, ['message-received', 'cleanup-start', 'timer-cancelled',
    'cleanup-complete', 'message-accepted', 'success-start', 'render-start',
    'render-error-caught', 'show-error', 'show-error-complete']);
  assert.deepEqual(errors, []);
  assert.equal(state.caughtRenderErrors.length, 1);
  assert.equal(state.caughtRenderErrors[0].name, 'TypeError');
  assert.match(state.caughtRenderErrors[0].message, pattern);
  assert.equal(state.loadingVisible, false);
  assert.equal(await page.locator('#app').isVisible(), false);
  assert.equal(await page.locator('#errorBox').isVisible(), true);
  assert.equal(await page.locator('#errorText').textContent(),
    'Não foi possível exibir este evento agora. Tente novamente em alguns instantes.');
  for (const phase of ['render-complete', 'failure-start', 'campaign-start', 'timer-fired', 'frontend-exception']) {
    assert.equal(state.events.includes(phase), false, phase);
  }
}
test('3 - tipos:{} lança erro de render e recupera UI sem campanha', t => isolated(t, async (page, errors) => {
  await expectRenderRecovery(page, errors, { ...resultFixture(), tipos: {} }, /forEach.*not a function/);
}));
test('4 - eventName ausente lança erro de render e recupera UI sem campanha', t => isolated(t, async (page, errors) => {
  await page.locator('#eventName').evaluate(element => element.remove());
  await expectRenderRecovery(page, errors, resultFixture(), /null.*textContent|textContent.*null/);
}));
