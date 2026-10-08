// LOCAL-ONLY browser regression: every request is fulfilled/aborted in Playwright.
// No production server, provider, real charge, order or ticket is contacted/created.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const ERA = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
const LEGACY = 'EVT-LOCAL-LEGACY';
const ORIGIN = 'http://ct-checkout.test';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const amount = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const round = n => Math.round(n * 100) / 100;

function catalog(eventId) {
  return { sucesso: true, evento: { id: eventId, nome: 'ERA BEAUTY | Local fixture' },
    visual: {}, identidadeCliente: { emailObrigatorio: false },
    tipos: [87, 120, 0].map((price, i) => ({ id: 'TYPE-' + i, nome: i === 1 ? 'VIP' : 'Individual', capacidadePorVenda: 1,
      lotes: [{ id: 'LOT-' + i, nome: 'Lote local', preco: amount(price), precoNumero: price, quantidadeLimitada: false }] })) };
}
function quote(p) {
  const subtotal = round(p.precoUnitario * p.quantidade), fee = round(subtotal * .10);
  return { sucesso: true, degradado: false, rolloutAtivo: true, revisao: 'LOCAL-POLICY-R1',
    resumo: { subtotalIngressos: subtotal, taxaCtPercentual: 10, taxaCtTotal: fee,
      taxaComprador: fee, taxaProdutor: 0, adicionaisComprador: 0, totalComprador: round(subtotal + fee), pagadorTaxa: 'COMPRADOR' } };
}
function coupon(p) {
  const price = p.tipoId === 'TYPE-1' ? 120 : 87, discounted = price - 10;
  return { sucesso: true, valido: true, cupom: { codigo: p.codigo }, calculo: {
    valorOriginalTotal: price * p.quantidade, valorFinalTotal: discounted * p.quantidade,
    descontoTotal: 10 * p.quantidade } };
}
async function until(fn, message, ms = 4000) {
  const limit = Date.now() + ms;
  while (Date.now() < limit) { if (await fn()) return; await delay(20); }
  assert.fail(message);
}
async function createFixture(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 },
    isMobile: !!options.mobile, hasTouch: !!options.mobile, serviceWorkers: 'block' });
  const page = await context.newPage();
  const state = { previews: [], coupons: [], payments: [], errors: [], unexpected: [], eventId: options.eventId || ERA };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => { const now = Date.now.bind(Date); window.__clockOffset = 0; Date.now = () => now() + window.__clockOffset; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN) {
      if (url.pathname === '/checkout/' || url.pathname === '/checkout/index.html')
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'checkout/index.html'), 'utf8') });
      if (['/assets/checkout-commercial-policy.js','/assets/fee-transparency.js','/assets/fee-transparency.css'].includes(url.pathname))
        return route.fulfill({ contentType: url.pathname.endsWith('.css')?'text/css':'application/javascript', body: fs.readFileSync(path.join(ROOT, url.pathname), 'utf8') });
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    }
    if (url.origin !== 'https://script.google.com' || request.method() !== 'POST') {
      state.unexpected.push(request.url()); return route.abort();
    }
    const params = new URLSearchParams(request.postData() || '');
    const method = params.get('metodo'), id = params.get('ctMinhaCariocaRequestId');
    const args = JSON.parse(params.get('argsJson') || '[]');
    let result, error = '';
    try {
      assert.equal(params.get('ctMinhaCariocaAction'), 'publicRpc');
      if (method === 'ctCheckoutPublicoCarregarEventoPROD') result = catalog(state.eventId);
      else if (method === 'ctPrecoPublicoLeituraPROD') {
        const p=args[0],price=p.tipoId==='TYPE-2'?0:p.tipoId==='TYPE-1'?120:87,base=price*p.quantidade;
        result={sucesso:true,ofertas:[{tipoId:p.tipoId,loteId:p.loteId,quantidade:p.quantidade,status:'CONFIRMADO',semTaxaConfirmada:true,resumo:{subtotalIngressos:base,taxaComprador:0,adicionaisComprador:0,totalComprador:base}}]};
      }
      else if (method === 'ctPoliticaComercialPreviewPublicoPROD') {
        state.previews.push(args[0]);
        result = options.preview ? await options.preview(args[0], state.previews.length) : quote(args[0]);
      } else if (method === 'ctCuponsPublicoValidarSeguroPROD') {
        state.coupons.push(args[0]); result = options.coupon ? await options.coupon(args[0], state.coupons.length) : coupon(args[0]);
      } else if (method === 'ctCheckoutPixPublicoIniciarPROD') {
        state.payments.push(args[0]);
        result = options.pay ? await options.pay(args[0], state.payments.length) : { sucesso: false, mensagem: 'Local mock: no order is created.' };
      } else { state.unexpected.push(method); throw new Error('Unexpected RPC ' + method); }
    } catch (err) { error = err.message; }
    const payload = JSON.stringify({ ctMinhaCariocaPost: true, id, ok: !error, resultado: result, erro: error }).replace(/</g, '\\u003c');
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><script>window.top.postMessage(' + payload + ', "*");</script>' });
  });
  await page.goto(ORIGIN + '/checkout/?evento=' + state.eventId);
  await page.locator('#typeSelect option[value="TYPE-0"]').waitFor({ state: 'attached' });
  await page.locator('#buyerName').fill('Comprador de Teste Local');
  await page.locator('#buyerCpf').fill('00000000000');
  await page.locator('#buyerWhatsapp').fill('81999999999');
  return { page, state, context,
    async select(index = 0) { await page.locator('#typeSelect').selectOption('TYPE-' + index); await page.locator('#lotSelect').selectOption('LOT-' + index); },
    async total(value) { await until(async () => (await page.locator('#summaryPrice').textContent()) === amount(value), 'Expected total ' + value); },
    async closeModal() { if (await page.locator('#modalBg').evaluate(e => e.classList.contains('open'))) await page.locator('#modalOk').click(); },
    async finish() { assert.deepEqual(state.errors, [], 'No uncaught browser errors'); assert.deepEqual(state.unexpected, [], 'No unexpected network or RPC'); await context.close(); } };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CT_CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox'] });
  let passed = 0;
  async function test(name, body) { await body(); passed++; console.log('PASS ' + name); }
  try {
    for (const mobile of [false, true]) await test('87 + 8.70 = 95.70, disclosure and payload (' + (mobile ? 'mobile' : 'desktop') + ')', async () => {
      const f = await createFixture(browser, { mobile }); await f.select(); await f.total(95.7);
      assert.equal(await f.page.locator('#feeBase').textContent(), amount(87));
      assert.equal(await f.page.locator('#feePlatform').textContent(), amount(8.7));
      assert.match(await f.page.locator('#feeLabel').textContent(), /Taxa de serviço/);
      assert(await f.page.locator('#feeSummary').isVisible());
      await f.page.locator('#feeInfo').click(); assert.match(await f.page.locator('#ctFeeText').textContent(), /Quando cobrada/); await f.page.keyboard.press('Escape');
      if (process.env.CT_EVIDENCE_DIR) { fs.mkdirSync(process.env.CT_EVIDENCE_DIR, { recursive: true }); await f.page.screenshot({ path: path.join(process.env.CT_EVIDENCE_DIR, mobile ? 'era-fee-mobile.png' : 'era-fee-desktop.png'), fullPage: true }); }
      await f.page.locator('#payButton').click(); await until(() => f.state.payments.length === 1, 'payment mock called');
      const payload = f.state.payments[0]; assert.equal(payload.politicaRevisaoVista, 'LOCAL-POLICY-R1');
      assert.equal(payload.politicaSubtotalVisto,87); assert.equal(payload.politicaTotalVisto,95.7);
      for (const field of ['precoUnitario', 'produtorId', 'taxaCtPercentual', 'pagadorTaxa', 'valorTotal', 'totalComprador']) assert(!(field in payload), 'No browser charge authority: ' + field);
      await f.finish();
    });
    await test('VIP 120 + 12 = 132 with card; method and quantity recalculation', async () => {
      const f = await createFixture(browser); await f.select(1); await f.total(132);
      await f.page.locator('#paymentCard').check(); await f.total(132);
      await until(() => f.state.previews.some(p => p.formaPagamento === 'CREDIT_CARD'), 'card preview');
      await f.page.locator('#quantity').fill('2'); await f.total(264);
      assert.equal(await f.page.locator('#feeBase').textContent(), amount(240));
      assert.equal(await f.page.locator('#feePlatform').textContent(), amount(24));
      await f.page.locator('[data-name]').fill('Participante Local'); await f.page.locator('#payButton').click();
      await until(() => f.state.payments.length === 1, 'card payment mock'); assert.equal(f.state.payments[0].formaPagamento, 'CREDIT_CARD'); assert.equal(f.state.payments[0].quantidadeVendas, 2);
      await f.finish();
    });
    const invalid = {
      degraded: r => { r.degradado = true; }, rolloutOff: r => { r.rolloutAtivo = false; },
      absentRollout: r => { delete r.rolloutAtivo; }, missingDegradedFlag: r => { delete r.degradado; }, missingRevision: r => { delete r.revisao; }, blankRevision: r => { r.revisao = ' '; },
      zeroFee: r => { r.resumo.taxaCtTotal = r.resumo.taxaComprador = r.resumo.taxaCtPercentual = 0; r.resumo.totalComprador = 87; },
      missingSummary: r => { delete r.resumo; }, wrongTotal: r => { r.resumo.totalComprador = 87; }, missingField: r => { delete r.resumo.taxaComprador; }
    };
    for (const [name, mutate] of Object.entries(invalid)) await test('blocks unsafe quote: ' + name, async () => {
      const f = await createFixture(browser, { preview(p) { const r = quote(p); mutate(r); return r; } });
      await f.select(); await f.page.locator('#feeRetry').waitFor({ state: 'visible' });
      assert.equal(await f.page.locator('#summaryPrice').textContent(), 'A confirmar');
      await f.page.locator('#payButton').click(); await delay(100); assert.equal(f.state.payments.length, 0);
      assert(await f.page.locator('#modalBg').evaluate(e => e.classList.contains('open'))); await f.finish();
    });
    await test('failed preview retry recovers without charge or stale total', async () => {
      const f = await createFixture(browser, { preview(p, n) { if (n === 1) throw new Error('Simulated offline'); return quote(p); } });
      await f.select(); await f.page.locator('#feeRetry').waitFor({ state: 'visible' }); await f.page.locator('#feeRetry').click(); await f.total(95.7);
      assert.equal(f.state.payments.length, 0); assert.equal(f.state.previews.length, 2); await f.finish();
    });
    await test('pending and stale quotes block payment then permit explicit retry', async () => {
      const f = await createFixture(browser, { async preview(p) { await delay(400); return quote(p); } });
      await f.select(); await f.page.locator('#payButton').click(); assert.equal(f.state.payments.length, 0); await f.closeModal(); await f.total(95.7);
      await f.page.evaluate(() => window.__clockOffset = 31000); await f.page.locator('#payButton').click(); assert.equal(f.state.payments.length, 0);
      await f.closeModal(); await f.total(95.7); await f.page.locator('#payButton').click(); await until(() => f.state.payments.length === 1, 'explicit retry after requote'); await f.finish();
    });
    await test('late quote cannot overwrite newer quantity or deselected type', async () => {
      const f = await createFixture(browser, { async preview(p, n) { await delay(n === 1 ? 800 : 20); return quote(p); } });
      await f.select(); await until(() => f.state.previews.length === 1, 'first delayed quote');
      await f.page.locator('#quantity').fill('2'); await f.total(191.4); await delay(850); await f.total(191.4);
      await f.page.locator('#quantity').fill('3'); await until(() => f.state.previews.length === 3, 'third quote');
      await f.page.locator('#typeSelect').selectOption(''); await delay(250); assert(!(await f.page.locator('#feeSummary').isVisible())); assert(!(await f.page.locator('#feeStatus').isVisible())); await f.finish();
    });
    await test('coupon apply/remove requotes; validation blocks paying old amount', async () => {
      const f = await createFixture(browser, { async coupon(p) { await delay(300); return coupon(p); } });
      await f.select(); await f.total(95.7); await f.page.locator('#couponToggle').click(); await f.page.locator('#couponCode').fill('LOCAL10');
      await f.page.locator('#couponApply').click(); await f.page.locator('#payButton').click(); assert.equal(f.state.payments.length, 0); await f.closeModal(); await f.total(84.7);
      assert.equal(f.state.previews.at(-1).cupomCodigo, 'LOCAL10'); assert.equal(f.state.previews.at(-1).precoUnitario, 77);
      await f.page.locator('#couponRemove').click(); await f.total(95.7); assert.equal(f.state.previews.at(-1).cupomCodigo, ''); await f.finish();
    });
    await test('late coupon validation cannot apply after quantity or method changes', async () => {
      const f = await createFixture(browser, { async coupon(p) { await delay(750); return coupon(p); } });
      await f.select(); await f.total(95.7); await f.page.locator('#couponToggle').click(); await f.page.locator('#couponCode').fill('LOCAL10'); await f.page.locator('#couponApply').click();
      await until(() => f.state.coupons.length === 1, 'coupon in flight'); await f.page.locator('#quantity').fill('2'); await f.page.locator('#paymentCard').check(); await f.total(191.4); await delay(900);
      await f.total(191.4); assert(!(await f.page.locator('#promoSummary').isVisible())); assert.equal(f.state.previews.at(-1).cupomCodigo, ''); await f.finish();
    });
    await test('repeated payment clicks and failed retry retain same idempotency', async () => {
      const f = await createFixture(browser, { async pay() { await delay(250); throw new Error('CT_PC_REVISAO_DIVERGENTE'); } });
      await f.select(); await f.total(95.7); await f.page.evaluate(() => { document.querySelector('#payButton').click(); document.querySelector('#payButton').click(); });
      await until(() => f.state.payments.length === 1, 'one mock request'); await f.page.locator('#modalBg.open').waitFor({ state: 'visible' });
      assert.equal(f.state.payments.length, 1); assert.equal(await f.page.locator('#typeSelect').inputValue(), 'TYPE-0');
      await f.closeModal(); await f.total(95.7); await f.page.locator('#payButton').click(); await until(() => f.state.payments.length === 2, 'retry mock request');
      assert.equal(f.state.payments[0].idempotenciaChave, f.state.payments[1].idempotenciaChave); await delay(300); await f.finish();
    });
    await test('legacy non-canary unchanged: no preview required and no revision field', async () => {
      const f = await createFixture(browser, { eventId: LEGACY }); await f.select(); await f.total(87);
      assert.equal(f.state.previews.length, 0); assert(await f.page.locator('#feeSummary').isVisible()); await f.page.locator('#payButton').click(); await until(() => f.state.payments.length === 1, 'legacy payment');
      assert(!('politicaRevisaoVista' in f.state.payments[0])); await f.finish();
    });
    await test('authoritative free catalog price remains zero', async () => {
      const f = await createFixture(browser); await f.select(2); await f.total(0);
      assert.equal(f.state.previews.length, 0); assert(await f.page.locator('#feeSummary').isVisible());
      await f.page.locator('#payButton').click(); await until(() => f.state.payments.length === 1, 'free checkout mock');
      assert(!('politicaRevisaoVista' in f.state.payments[0])); await f.finish();
    });
    console.log('PASS checkout-era-beauty.browser: ' + passed + ' scenarios; all network mocked; zero real charges/orders/tickets');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
