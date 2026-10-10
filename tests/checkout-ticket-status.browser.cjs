'use strict';
// Isolated browser fixtures only: every request is fulfilled locally or aborted.
// Never forward a request, contact production, or create a real payment/order.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1:4179';
const EVENT = 'EVT-LOCAL-NAVIGATION', ORDER = 'PED-LOCAL-NAVIGATION', TOKEN = 'LOCAL-RECOVERY-ONLY';
const RECOVERY = 'CT_CHECKOUT_RECOVERY_' + EVENT;
const ENDPOINTS = new Set(['https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec',
  'https://script.google.com/macros/s/AKfycbyhx6mnGJMsgpGmx-C1r6ZUXbrE66-X6Rkusp1ulVOGcDfJfIs-jgysWp1PfkqB1UC3hg/exec']);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, name) { const end = Date.now() + 6000; while (Date.now() < end) { if (await check()) return; await wait(25); } assert.fail(name); }
function catalog() { return { sucesso: true, evento: { id: EVENT, nome: 'Evento sintético de navegação' }, visual: {}, identidadeCliente: { emailObrigatorio: false },
  tipos: [{ id: 'LOCAL-TYPE', nome: 'Individual', capacidadePorVenda: 1, lotes: [{ id: 'LOCAL-LOT', nome: 'Lote local', preco: 'R$ 25,00', precoNumero: 25, quantidadeLimitada: false }] }] }; }
const PIX = { qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=', copiaECola: 'LOCAL-PIX-FIXTURE-NOT-PAYABLE' };
function ticket(name, n = 1) { return { codigo: 'CT-LOCAL-' + n, nome: name, link: 'https://cariocaticket.com.br/ingresso/?codigo=CT-LOCAL-' + n + '&sig=LOCAL-NOT-VALID' }; }
function order(options) { return { sucesso: true, autorizado: true, encontrado: true, consultaToken: TOKEN,
  pedido: { pedidoId: ORDER, eventoId: EVENT, status: options.status || 'AGUARDANDO_PAGAMENTO', expiraEm: new Date(Date.now() + 600000).toISOString() },
  pagamento: { forma: options.method || 'PIX', pix: PIX, invoiceUrl: 'https://www.asaas.com/i/LOCAL-NOT-PAYABLE' },
  ingressoEmitido: options.emitted === undefined ? false : options.emitted, ingressos: options.tickets || [] }; }
async function fixture(browser, routePath, mobile, options = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 320, height: 740 } : { width: 1365, height: 900 }, serviceWorkers: 'block' });
  const state = { payments: [], consults: 0, polls: 0, unexpected: [], errors: [], release: null, home: 0 };
  const page = await context.newPage();
  if(options.clock) await page.clock.install();
  if(options.noStorage) await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Fixture storage blocked', 'SecurityError'); }; });
  page.on('pageerror', e => state.errors.push(e.message));
  if (options.recover) await context.addInitScript(({ key, value }) => { if (window === window.top && !sessionStorage.getItem('FIXTURE_SEEDED')) { localStorage.setItem(key, value); sessionStorage.setItem('FIXTURE_SEEDED', 'yes'); } },
    { key: RECOVERY, value: JSON.stringify({ pedidoId: ORDER, token: TOKEN }) });
  if (options.noDialog) await context.addInitScript(() => { HTMLDialogElement.prototype.showModal = undefined; });
  await context.routeWebSocket('**/*', socket => { state.unexpected.push('websocket'); socket.close(); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    try {
      if (url.origin === ORIGIN && req.method() === 'GET') {
        if (url.pathname === '/') { state.home++; return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Home fixture</title><h1>Página inicial local</h1>' }); }
        const files = { '/assets/public-i18n.js':'assets/public-i18n.js','/assets/checkout-language.js':'assets/checkout-language.js','/assets/checkout-language.css':'assets/checkout-language.css','/assets/checkout-translations.js':'assets/checkout-translations.js', '/checkout/': 'checkout/index.html', '/checkout-v2/': 'checkout-v2/index.html',
          '/assets/checkout-home-navigation.js': 'assets/checkout-home-navigation.js', '/assets/checkout-home-navigation.css': 'assets/checkout-home-navigation.css',
          '/assets/checkout-commercial-policy.js': 'assets/checkout-commercial-policy.js' };
        if (Object.hasOwn(files, url.pathname)) {
          if (options.missingHelper && url.pathname.endsWith('checkout-home-navigation.js')) return route.fulfill({ contentType: 'application/javascript', body: '// Simulated missing helper' });
          const type = url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'application/javascript' : 'text/html';
          return route.fulfill({ contentType: type, body: options.base && url.pathname.endsWith('/') ? (process.env.CT_BASE_ROOT ? fs.readFileSync(path.join(process.env.CT_BASE_ROOT, files[url.pathname])) : execFileSync('git', ['show', (process.env.CT_BASE_REVISION || 'HEAD') + ':' + files[url.pathname]], { cwd: ROOT })) : fs.readFileSync(path.join(ROOT, files[url.pathname])) });
        }
        if (['/pwa-register.js', '/assets/ct-analytics.js'].includes(url.pathname)) return route.fulfill({ contentType: 'application/javascript', body: '// Explicit no-op fixture: no registration/telemetry.' });
        if (url.pathname === '/manifest.webmanifest') return route.fulfill({ contentType: 'application/manifest+json', body: '{}' });
        if (url.pathname === '/assets/carioca-ticket-icon-192.png') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=', 'base64') });
        throw Error('unknown-local-path');
      }
      assert(ENDPOINTS.has(req.url()) && req.method() === 'POST', 'unknown-destination');
      const fields = new URLSearchParams(req.postData() || '');
      assert.deepEqual([...fields.keys()].sort(), ['argsJson', 'ctMinhaCariocaAction', 'ctMinhaCariocaRequestId', 'metodo']);
      assert.equal(fields.get('ctMinhaCariocaAction'), 'publicRpc');
      const args = JSON.parse(fields.get('argsJson')), method = fields.get('metodo');
      let result;
      if (method === 'ctCheckoutPublicoCarregarEventoPROD') { assert.equal(args[0], EVENT); result = catalog(); }
      else if (method === 'ctCheckoutPixPublicoIniciarPROD') {
        state.payments.push(args[0]);
        if(options.timeoutPayment) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><!-- Simulated missing response: real bridge timeout must release the UI. -->' });
        if (options.holdPayment) await new Promise(resolve => { state.release = resolve; });
        result = options.failPayment ? { sucesso: false } : order(options);
      } else if (method === 'ctCheckoutPixPublicoConsultarPROD') { state.consults++; assert.deepEqual(args, [ORDER, TOKEN]); if(options.holdConsult) await new Promise(resolve => { state.releaseConsult = resolve; }); result = order(options); if(options.recoveredStatus) result.pedido.status = options.recoveredStatus; }
      else if (['ctCheckoutPixPublicoStatusLocalPROD', 'ctCheckoutPixPublicoReconciliarPROD'].includes(method)) { state.polls++; assert.deepEqual(args, [ORDER, TOKEN]); if(method === 'ctCheckoutPixPublicoReconciliarPROD' && state.holdReconcile) await new Promise(resolve => { state.releaseReconcile = resolve; }); result = order(options); }
      else throw Error('undeclared-rpc');
      const payload = JSON.stringify({ ctMinhaCariocaPost: true, id: fields.get('ctMinhaCariocaRequestId'), ok: true, resultado: result }).replace(/</g, '\\u003c');
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><script>window.top.postMessage(' + payload + ',"*")</script>' });
    } catch (e) { state.unexpected.push(e.message); await route.abort('blockedbyclient'); }
  });
  await page.goto(ORIGIN + routePath + '?evento=' + EVENT);
  await page.locator('#typeSelect option[value="LOCAL-TYPE"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#eventName').textContent(), 'Evento sintético de navegação', 'UTF-8 fixture text');
  if(!options.holdConsult) await page.locator('#loading').waitFor({ state: 'hidden' });
  return { page, state, context,
    async fill() {
      await page.locator('#typeSelect').selectOption('LOCAL-TYPE'); await page.locator('#lotSelect').selectOption('LOCAL-LOT');
      await page.locator('#buyerName').fill('Comprador Sintético'); await page.locator('#buyerCpf').fill('00000000000'); await page.locator('#buyerWhatsapp').fill('81999999999');
      if (options.method === 'CREDIT_CARD') await page.locator('#paymentCard').check();
    },
    async open() { await page.locator('#checkoutHome').click(); await page.locator('#checkoutLeaveDialog').waitFor({ state: 'visible' }); },
    async finish() { assert.deepEqual(state.errors, [], 'uncaught JS errors'); assert.deepEqual(state.unexpected, [], 'undeclared traffic'); await context.close(); }
  };
}
async function visible(page, selector, expected = true) { assert.equal(await page.locator(selector).isVisible(), expected, selector + ' visibility'); }
async function shot(f, routePath, mobile, stage) {
  if (!process.env.CT_EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.CT_EVIDENCE_DIR, { recursive: true });
  await f.page.screenshot({ path: path.join(process.env.CT_EVIDENCE_DIR, routePath.replaceAll('/', '') + (mobile ? '-mobile-' : '-desktop-') + stage + '.png'), fullPage: true });
}
async function refresh(f, options) {
  const before = f.state.polls;
  await f.page.locator(options.method === 'CREDIT_CARD' ? '#cardRefreshButton' : '#refreshButton').click();
  await until(() => f.state.polls > before, 'intercepted refresh');
  await until(async () => !(await f.page.locator(options.method === 'CREDIT_CARD' ? '#cardRefreshButton' : '#refreshButton').isDisabled()), 'refresh response rendered');
}
async function confirmed(f, method) {
  const panel = method === 'CREDIT_CARD' ? '#cardPanel' : '#pixPanel';
  const status = method === 'CREDIT_CARD' ? '#cardStatus' : '#pixStatus';
  await until(async () => /Pagamento confirmado/.test(await f.page.locator(status).textContent()), 'confirmed status rendered');
  await visible(f.page, panel); await visible(f.page, '#successPanel', false);
  assert.equal(await f.page.locator(panel).evaluate(e => e.classList.contains('payment-confirmed')), true);
  for (const selector of ['#qrImage', '#pixCode', '#copyButton', '#expiryText', '#cardExpiryText', '#cardPaymentLink', '.secure-card-note']) await visible(f.page, selector, false);
  for (const [attribute, value] of [['role', 'status'], ['aria-live', 'polite'], ['aria-atomic', 'true']]) assert.equal(await f.page.locator(status).getAttribute(attribute), value);
  assert.deepEqual(JSON.parse(await f.page.evaluate(key => localStorage.getItem(key), RECOVERY)), { pedidoId: ORDER, token: TOKEN });
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CT_CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox'] });
  let passed = 0;
  async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
  try {
    for (const routePath of ['/checkout/', '/checkout-v2/']) for (const mobile of [false, true]) {
      const name = routePath + (mobile ? ' 320px' : ' desktop');
      if (process.env.CT_EVIDENCE_DIR) {
        for (const stage of ['confirmed', 'released']) {
          const f = await fixture(browser, routePath, mobile, { recover: true, base: true, status: 'CONCLUIDO', emitted: stage === 'released', tickets: stage === 'released' ? [ticket('Participante Sintético')] : [] });
          await visible(f.page, stage === 'released' ? '#successPanel' : '#pixPanel');
          await shot(f, routePath, mobile, 'before-' + stage); await f.finish();
        }
      }
      for (const method of ['PIX', 'CREDIT_CARD']) await test(name + ' ' + method + ' pending, confirmed states, repeated updates, reload/back and safe release', async () => {
        const options = { recover: true, method };
        const f = await fixture(browser, routePath, mobile, options);
        const status = method === 'PIX' ? '#pixStatus' : '#cardStatus';
        if (method === 'PIX') {
          for (const selector of ['#qrImage', '#pixCode', '#copyButton', '#expiryText']) await visible(f.page, selector);
          assert.equal(await f.page.locator('#pixCode').inputValue(), PIX.copiaECola);
          assert.match(await f.page.locator('#expiryText').textContent(), /Reserva válida/);
        } else {
          await visible(f.page, '#cardPaymentLink'); await visible(f.page, '#cardExpiryText'); await visible(f.page, '.secure-card-note');
        }
        await visible(f.page, '#successPanel', false);
        await shot(f, routePath, mobile, 'after-pending-' + method.toLowerCase());
        for (const value of ['PAGO', 'PROCESSANDO', 'CONCLUIDO']) {
          options.status = value; await refresh(f, options); await confirmed(f, method);
        }
        if (method === 'PIX') await shot(f, routePath, mobile, 'after-confirmed');
        options.emitted = true; options.tickets = [{ codigo: 'LOCAL-UNSIGNED', link: 'javascript:alert(1)' }, { link: 'https://evil.example/ingresso/' }];
        await refresh(f, options); await confirmed(f, method);
        options.emitted = 'true'; options.tickets = [ticket('Participante Sintético')];
        await refresh(f, options); await confirmed(f, method);
        options.emitted = false;
        await refresh(f, options); await confirmed(f, method);
        await f.open(); assert.match(await f.page.locator('#checkoutLeaveMessage').textContent(), /não cancela o pedido/);
        await f.page.locator('#checkoutStay').click();
        await f.page.reload(); await f.page.locator('#loading').waitFor({ state: 'hidden' }); await confirmed(f, method);
        await f.open(); await f.page.locator('#checkoutLeave').click(); await f.page.waitForURL(ORIGIN + '/');
        await f.page.goBack(); await f.page.locator('#loading').waitFor({ state: 'hidden' }); await confirmed(f, method);
        assert.equal(f.state.payments.length, 0, 'recovery and UI updates never create another order');
        options.emitted = true;
        await refresh(f, options); await f.page.locator('#successPanel').waitFor({ state: 'visible' });
        const link = f.page.locator('#ticketLinks a');
        assert.equal(await link.count(), 1); assert.match(await link.textContent(), /Abrir meu ingresso/);
        await link.focus(); await f.page.keyboard.press('Tab');
        assert.equal(await f.page.locator('#minhaCariocaLink').evaluate(e => e === document.activeElement), true, 'single ticket tabs directly to secondary account action');
        const url = new URL(await link.getAttribute('href'));
        assert.equal(url.origin, 'https://cariocaticket.com.br'); assert.equal(url.pathname, '/ingresso/');
        assert(url.searchParams.get('codigo')); assert(url.searchParams.get('sig'));
        await visible(f.page, '#pixPanel', false); await visible(f.page, '#cardPanel', false);
        assert.equal(await f.page.evaluate(key => localStorage.getItem(key), RECOVERY), null, 'successful release clears existing recovery');
        assert.equal(await f.page.locator('#minhaCariocaLink').evaluate(e => e.classList.contains('secondary')), true);
        assert.match(await f.page.locator('#minhaCariocaLink').textContent(), /Meus ingressos/);
        assert(await link.evaluate(e => !!(e.parentElement.compareDocumentPosition(document.querySelector('#minhaCariocaLink')) & Node.DOCUMENT_POSITION_FOLLOWING)));
        const styles = await f.page.evaluate(() => ({ primary: getComputedStyle(document.querySelector('#ticketLinks a')).background, secondary: getComputedStyle(document.querySelector('#minhaCariocaLink')).background }));
        assert.notEqual(styles.primary, styles.secondary, 'primary ticket action visually distinguished from secondary account action');
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
        if (method === 'PIX') await shot(f, routePath, mobile, 'after-released');
        await f.page.locator('#checkoutHome').click(); await f.page.waitForURL(ORIGIN + '/');
        await f.finish();
      });
      await test(name + ' multiple participant tickets remain first and safe', async () => {
        const f = await fixture(browser, routePath, mobile, { recover: true, status: 'CONCLUIDO', emitted: true, tickets: [ticket('Ana Sintética', 1), ticket('Bruno Sintético de Albuquerque e Vasconcelos Participante com Nome Longo', 2), { link: 'https://evil.example/no-ticket' }] });
        await f.page.locator('#successPanel').waitFor({ state: 'visible' });
        const links = f.page.locator('#ticketLinks a'); assert.equal(await links.count(), 2);
        assert.match(await links.nth(0).textContent(), /Abrir ingresso 1 — Ana Sintética/);
        assert.match(await links.nth(1).textContent(), /Abrir ingresso 2 — Bruno Sintético/);
        await links.first().focus(); await f.page.keyboard.press('Tab');
        assert.equal(await links.nth(1).evaluate(e => e === document.activeElement), true, 'keyboard reaches second ticket before secondary account action');
        await f.page.keyboard.press('Tab');
        assert.equal(await f.page.locator('#minhaCariocaLink').evaluate(e => e === document.activeElement), true);
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'long participant name does not overflow');
        for (const href of await links.evaluateAll(es => es.map(e => e.href))) assert.equal(new URL(href).origin, 'https://cariocaticket.com.br');
        assert(await links.last().evaluate(e => e.getBoundingClientRect().bottom <= document.querySelector('#minhaCariocaLink').getBoundingClientRect().top));
        await shot(f, routePath, mobile, 'after-multiple'); await f.finish();
      });
    }
    for (const routePath of ['/checkout/', '/checkout-v2/']) for (const status of ['EXPIRADO', 'CANCELADO', 'FALHA']) await test(routePath + ' ' + status + ' safely restores sale form', async () => {
      const f = await fixture(browser, routePath, false, { recover: true, status });
      await f.page.locator('#modalBg.open').waitFor({ state: 'visible' });
      await visible(f.page, '#successPanel', false); await visible(f.page, '#pixPanel', false); await visible(f.page, '#cardPanel', false);
      await visible(f.page, '#salePanel'); await visible(f.page, '#buyerPanel'); await visible(f.page, '#payActionPanel');
      assert.equal(await f.page.evaluate(key => localStorage.getItem(key), RECOVERY), null);
      assert.equal(f.state.payments.length, 0); await f.page.locator('#modalOk').click(); await f.finish();
    });
    console.log('PASS checkout-ticket-status: ' + passed + ' isolated scenarios; all traffic intercepted; zero real payments/orders.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
