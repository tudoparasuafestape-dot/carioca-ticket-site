'use strict';
// Isolated browser fixtures only: every request is fulfilled locally or aborted.
// Never forward a request, contact production, or create a real payment/order.
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
function order(method = 'PIX', complete = false) { return { sucesso: true, autorizado: true, encontrado: true, consultaToken: TOKEN,
  pedido: { pedidoId: ORDER, eventoId: EVENT, status: complete ? 'CONCLUIDO' : 'AGUARDANDO_PAGAMENTO', expiraEm: new Date(Date.now() + 600000).toISOString() },
  pagamento: { forma: method, pix: null, invoiceUrl: '' }, ingressoEmitido: complete,
  ingressos: complete ? [{ codigo: 'CT-LOCAL-TEST', link: 'https://cariocaticket.com.br/ingresso/?codigo=CT-LOCAL-TEST&sig=LOCAL-NOT-VALID' }] : [] }; }
async function fixture(browser, routePath, mobile, options = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 320, height: 740 } : { width: 1365, height: 900 }, serviceWorkers: 'block' });
  const state = { payments: [], consults: 0, polls: 0, unexpected: [], errors: [], release: null, home: 0 };
  const page = await context.newPage();
  if(options.clock) await page.clock.install();
  if(options.noStorage) await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Fixture storage blocked', 'SecurityError'); }; });
  page.on('pageerror', e => state.errors.push(e.message));
  if (options.recover) await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); },
    { key: RECOVERY, value: JSON.stringify({ pedidoId: ORDER, token: TOKEN }) });
  if (options.noDialog) await context.addInitScript(() => { HTMLDialogElement.prototype.showModal = undefined; });
  await context.routeWebSocket('**/*', socket => { state.unexpected.push('websocket'); socket.close(); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    try {
      if (url.origin === ORIGIN && req.method() === 'GET') {
        if (url.pathname === '/') { state.home++; return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Home fixture</title><h1>Página inicial local</h1>' }); }
        const files = { '/checkout/': 'checkout/index.html', '/checkout-v2/': 'checkout-v2/index.html',
          '/assets/checkout-home-navigation.js': 'assets/checkout-home-navigation.js', '/assets/checkout-home-navigation.css': 'assets/checkout-home-navigation.css',
          '/assets/checkout-commercial-policy.js': 'assets/checkout-commercial-policy.js' };
        if (Object.hasOwn(files, url.pathname)) {
          if (options.missingHelper && url.pathname.endsWith('checkout-home-navigation.js')) return route.fulfill({ contentType: 'application/javascript', body: '// Simulated missing helper' });
          const type = url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'application/javascript' : 'text/html';
          return route.fulfill({ contentType: type, body: fs.readFileSync(path.join(ROOT, files[url.pathname])) });
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
        if(options.timeoutPayment) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><!-- Simulated missing response: real bridge timeout must release the UI. -->' });
        if (options.holdPayment) await new Promise(resolve => { state.release = resolve; });
        result = options.failPayment ? { sucesso: false } : order(options.method, options.complete);
      } else if (method === 'ctCheckoutPixPublicoConsultarPROD') { state.consults++; assert.deepEqual(args, [ORDER, TOKEN]); if(options.holdConsult) await new Promise(resolve => { state.releaseConsult = resolve; }); result = order(options.method, options.complete); if(options.recoveredStatus) result.pedido.status = options.recoveredStatus; }
      else if (['ctCheckoutPixPublicoStatusLocalPROD', 'ctCheckoutPixPublicoReconciliarPROD'].includes(method)) { state.polls++; assert.deepEqual(args, [ORDER, TOKEN]); if(method === 'ctCheckoutPixPublicoReconciliarPROD' && state.holdReconcile) await new Promise(resolve => { state.releaseReconcile = resolve; }); result = order(options.method, options.complete); }
      else throw Error('undeclared-rpc');
      const payload = JSON.stringify({ ctMinhaCariocaPost: true, id: fields.get('ctMinhaCariocaRequestId'), ok: true, resultado: result }).replace(/</g, '\\u003c');
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script>window.top.postMessage(' + payload + ',"*")</script>' });
    } catch (e) { state.unexpected.push(e.message); await route.abort('blockedbyclient'); }
  });
  await page.goto(ORIGIN + routePath + '?evento=' + EVENT);
  await page.locator('#typeSelect option[value="LOCAL-TYPE"]').waitFor({ state: 'attached' });
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
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CT_CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox'] });
 let passed = 0;
 async function test(name, fn) { await fn(); console.log('PASS ' + name); passed++; }
 try {
  for (const routePath of ['/checkout/', '/checkout-v2/']) for (const mobile of [false, true]) {
   const name = routePath + (mobile ? ' mobile' : ' desktop');
   await test(name + ' pristine logo navigates home; no payment', async () => {
    const f = await fixture(browser, routePath, mobile); assert.equal(await f.page.locator('#checkoutHome').getAttribute('href'), '/');
    await f.page.locator('#checkoutHome').focus(); await f.page.keyboard.press('Enter'); await f.page.waitForURL(ORIGIN + '/');
    assert.equal(f.state.payments.length, 0); assert.equal(f.state.home, 1); await f.finish();
   });
   await test(name + ' dirty form cancel, focus, Escape, repeated clicks, confirm', async () => {
    const f = await fixture(browser, routePath, mobile); await f.fill(); await f.page.locator('#quantity').fill('2'); await f.page.locator('#participants [data-name]').fill('Convidado Sintético');
    await f.open(); assert.equal(await f.page.locator('#checkoutStay').evaluate(e => e === document.activeElement), true);
    assert.match(await f.page.locator('#checkoutLeaveMessage').textContent(), /dados preenchidos/);
    assert.equal(await f.page.locator('#checkoutLeaveDialog').getAttribute('aria-labelledby'), 'checkoutLeaveTitle');
    await f.page.keyboard.press('Shift+Tab'); assert.equal(await f.page.locator('#checkoutLeave').evaluate(e => e === document.activeElement), true);
    await f.page.keyboard.press('Tab'); assert.equal(await f.page.locator('#checkoutStay').evaluate(e => e === document.activeElement), true);
    await f.page.evaluate(() => { document.querySelector('#checkoutHome').click(); document.querySelector('#checkoutHome').click(); });
    assert.equal(await f.page.locator('dialog[open]').count(), 1);
    if (process.env.CT_EVIDENCE_DIR) { fs.mkdirSync(process.env.CT_EVIDENCE_DIR, { recursive: true }); await f.page.screenshot({ path: path.join(process.env.CT_EVIDENCE_DIR, routePath.replaceAll('/', '') + (mobile ? '-mobile' : '-desktop') + '.png') }); }
    await f.page.locator('#checkoutStay').click(); assert.equal(await f.page.locator('#checkoutHome').evaluate(e => e === document.activeElement), true);
    assert.equal(await f.page.locator('#buyerName').inputValue(), 'Comprador Sintético'); assert.equal(await f.page.locator('#participants [data-name]').inputValue(), 'Convidado Sintético');
    assert.equal(await f.page.locator('#quantity').inputValue(), '2'); assert.equal(await f.page.locator('#lotSelect').inputValue(), 'LOCAL-LOT');
    await f.open(); await f.page.keyboard.press('Escape'); await f.page.locator('#checkoutLeaveDialog').waitFor({ state: 'hidden' });
    assert.equal(await f.page.locator('#checkoutHome').evaluate(e => e === document.activeElement), true);
    assert.equal(await f.page.evaluate(() => localStorage.length), 0, 'no new PII or state storage');
    await f.open(); await f.page.locator('#checkoutLeave').click(); await f.page.waitForURL(ORIGIN + '/');
    assert.equal(f.state.payments.length, 0); assert.equal(f.state.home, 1); await f.finish();
   });
   await test(name + ' in-flight creation blocks exit, pending order keeps polling and recovery', async () => {
    const f = await fixture(browser, routePath, mobile, { holdPayment: true, method: mobile ? 'CREDIT_CARD' : 'PIX' }); await f.fill();
    await f.page.locator('#payButton').click(); await until(() => !!f.state.release, 'held local payment');
    // The production loading overlay already prevents pointer access. Exercise the guard too.
    await f.page.evaluate(() => document.querySelector('#checkoutHome').click());
    await f.page.locator('#checkoutLeaveDialog').waitFor({ state: 'visible' });
    assert(await f.page.locator('#checkoutLeave').isDisabled()); assert.match(await f.page.locator('#checkoutLeaveMessage').textContent(), /aguardando a resposta/);
    await f.page.locator('#checkoutStay').click(); assert.equal(f.state.payments.length, 1);
    await f.page.evaluate(() => document.querySelector('#checkoutHome').click()); f.state.release();
    await until(async () => !(await f.page.locator('#checkoutLeave').isDisabled()), 'exit released after response');
    assert.match(await f.page.locator('#checkoutLeaveMessage').textContent(), /não cancela o pedido/);
    const stored = await f.page.evaluate(key => localStorage.getItem(key), RECOVERY); assert.deepEqual(JSON.parse(stored), { pedidoId: ORDER, token: TOKEN });
    const idempotency = f.state.payments[0].idempotenciaChave; assert(idempotency);
    await until(() => f.state.polls > 0, 'polling continues while confirmation is open');
    await f.page.locator('#checkoutStay').click(); await f.open(); await f.page.locator('#checkoutLeave').click(); await f.page.waitForURL(ORIGIN + '/');
    assert.equal(await f.page.evaluate(key => localStorage.getItem(key), RECOVERY), stored);
    await f.page.goBack(); await f.page.locator('#loading').waitFor({ state: 'hidden' });
    await until(() => f.state.consults > 0, 'existing recovery invoked after back');
    assert.equal(f.state.payments.length, 1, 'no duplicate charge from returning');
    assert.equal(await f.page.evaluate(key => localStorage.getItem(key), 'CT_CHECKOUT_IDEMPOTENCY_' + EVENT + '_' + (mobile ? 'CREDIT_CARD' : 'PIX')), idempotency);
    await f.open(); await f.page.locator('#checkoutStay').click();
    await f.finish();
   });
  }
  for (const routePath of ['/checkout/', '/checkout-v2/']) {
   await test(routePath + ' initial saved-order recovery blocks logo until consultation completes', async () => {
    const f = await fixture(browser, routePath, false, { recover: true, holdConsult: true });
    await until(() => !!f.state.releaseConsult, 'held saved-order consultation');
    await f.page.evaluate(() => document.querySelector('#checkoutHome').click()); assert(await f.page.locator('#checkoutLeave').isDisabled());
    assert.match(await f.page.locator('#checkoutLeaveMessage').textContent(), /consultando um pedido anterior/);
    f.state.releaseConsult(); await until(async () => !(await f.page.locator('#checkoutLeave').isDisabled()), 'saved order rendered');
    assert.match(await f.page.locator('#checkoutLeaveMessage').textContent(), /não cancela o pedido/);
    await f.page.locator('#checkoutStay').click(); assert.equal(f.state.payments.length, 0); await f.finish();
   });
   await test(routePath + ' failed creation releases guard without changing retry idempotency', async () => {
    const f = await fixture(browser, routePath, false, { holdPayment: true, failPayment: true }); await f.fill();
    await f.page.locator('#payButton').click(); await until(() => !!f.state.release, 'held failed creation');
    await f.page.evaluate(() => document.querySelector('#checkoutHome').click()); assert(await f.page.locator('#checkoutLeave').isDisabled());
    f.state.release(); await until(async () => !(await f.page.locator('#checkoutLeave').isDisabled()), 'failed creation releases exit');
    await f.page.locator('#checkoutStay').click(); await f.page.locator('#modalOk').click();
    const key = f.state.payments[0].idempotenciaChave; f.state.release = null;
    await f.page.locator('#payButton').click(); await until(() => !!f.state.release, 'explicit retry');
    assert.equal(f.state.payments[1].idempotenciaChave, key); f.state.release(); await f.page.locator('#loading').waitFor({ state: 'hidden' }); await f.finish();
   });
   await test(routePath + ' bridge timeout releases creation guard without new payment', async () => {
    const f = await fixture(browser, routePath, false, { clock: true, timeoutPayment: true }); await f.fill();
    await f.page.locator('#payButton').click(); await until(() => f.state.payments.length === 1, 'silent local response');
    await f.page.evaluate(() => document.querySelector('#checkoutHome').click()); assert(await f.page.locator('#checkoutLeave').isDisabled());
    await f.page.clock.fastForward(45001); await until(async () => !(await f.page.locator('#checkoutLeave').isDisabled()), 'real bridge timeout');
    assert.equal(f.state.payments.length, 1); await f.page.locator('#checkoutStay').click(); await f.finish();
   });
   await test(routePath + ' unavailable storage does not promise recovery or create another payment', async () => {
    const f = await fixture(browser, routePath, false, { noStorage: true }); await f.fill(); await f.page.locator('#payButton').click();
    await f.page.locator('#pixPanel').waitFor({ state: 'visible' }); await f.open();
    assert.match(await f.page.locator('#checkoutLeaveMessage').textContent(), /depende dos dados disponíveis/);
    assert.equal(await f.page.evaluate(key => localStorage.getItem(key), RECOVERY), null);
    await f.page.locator('#checkoutStay').click(); assert.equal(f.state.payments.length, 1); await f.finish();
   });
   await test(routePath + ' reconciliation does not block an existing-order exit', async () => {
    const f = await fixture(browser, routePath, false, { recover: true }); f.state.holdReconcile = true;
    await f.page.locator('#refreshButton').click(); await until(() => !!f.state.releaseReconcile, 'held reconciliation');
    await f.open(); assert(!(await f.page.locator('#checkoutLeave').isDisabled())); assert.match(await f.page.locator('#checkoutLeaveMessage').textContent(), /não cancela o pedido/);
    await f.page.locator('#checkoutStay').click(); f.state.releaseReconcile(); await f.finish();
   });
   await test(routePath + ' terminal previous order does not bypass new-creation guard', async () => {
    const f = await fixture(browser, routePath, false, { recover: true, recoveredStatus: 'EXPIRADO', holdPayment: true });
    await f.page.locator('#modalBg.open').waitFor({ state: 'visible' }); await f.page.locator('#modalOk').click(); await f.fill();
    await f.page.locator('#payButton').click(); await until(() => !!f.state.release, 'new creation after expired order');
    await f.page.evaluate(() => document.querySelector('#checkoutHome').click()); assert(await f.page.locator('#checkoutLeave').isDisabled());
    f.state.release(); await until(async () => !(await f.page.locator('#checkoutLeave').isDisabled()), 'new recovery saved');
    await f.page.locator('#checkoutStay').click(); assert.equal(f.state.payments.length, 1); await f.finish();
   });
   await test(routePath + ' recovered completed order leaves without dirty warning', async () => {
    const f = await fixture(browser, routePath, false, { recover: true, complete: true }); await f.page.locator('#successPanel').waitFor({ state: 'visible' });
    await f.page.locator('#checkoutHome').click(); await f.page.waitForURL(ORIGIN + '/'); assert.equal(f.state.payments.length, 0); await f.finish();
   });
   await test(routePath + ' autofill detected without input event; legacy dialog fallback cancel', async () => {
    const f = await fixture(browser, routePath, false, { noDialog: true }); await f.page.locator('#buyerName').evaluate(e => { e.value = 'Autofill Sintético'; });
    let confirms = 0; f.page.on('dialog', async dialog => { assert.equal(dialog.type(), 'confirm'); confirms++; await dialog.dismiss(); });
    await f.page.locator('#checkoutHome').click(); assert.equal(confirms, 1); assert.equal(await f.page.locator('#buyerName').inputValue(), 'Autofill Sintético'); await f.finish();
   });
   await test(routePath + ' missing navigation asset fails closed', async () => {
    const f = await fixture(browser, routePath, false, { missingHelper: true }); await f.fill();
    let alerts = 0; f.page.on('dialog', async dialog => { assert.equal(dialog.type(), 'alert'); alerts++; await dialog.dismiss(); });
    await f.page.locator('#checkoutHome').click(); assert.equal(alerts, 1); assert.equal(f.state.home, 0); await f.finish();
   });
  }
  console.log('PASS checkout-home-navigation: ' + passed + ' isolated scenarios; zero forwarded requests/real payments.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
