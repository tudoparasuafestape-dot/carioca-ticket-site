'use strict';
// Actual HTML/assets + local RPC fixtures. Offline, unreachable proxy, blocked
// service workers, deny-all network guard: no live RPC/provider/map/charge/ticket.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { installIsolatedNetwork } = require('./safety/isolated-network.cjs');
const { createFixtures } = require('./fixtures/public-canary.cjs');
const { temporalEnvelope, legacyNoEndTemporal } = require('./fixtures/public-temporal-envelope.cjs');
const ROOT = path.resolve(__dirname, '..'), ORIGIN = 'http://127.0.0.1:4179';
const SAMBA = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD', ERA = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
const MESSAGE = 'Evento encerrado.';
const ORDER = 'ORDER-SYNTHETIC', TOKEN = 'TOKEN-SYNTHETIC', KEY = 'KEY-SYNTHETIC-PRE-CLOSURE';
const OUT = process.env.CT_EVIDENCE_DIR || 'test-results/advance-sales';
const report = [];
// Synthetic controlled server/client instant, unrelated to the runner's wall clock.
const FIXTURE_NOW = Date.UTC(2026, 9, 21, 12);
function catalog(id, profile = 'checkout', nowMs = FIXTURE_NOW) {
  return { sucesso: true, ...temporalEnvelope(profile, nowMs), evento: { id, nome: id === SAMBA ? 'Roda de Samba Estilo Carioca' : 'ERA BEAUTY', data: '11/10/2026', horario: '15h',
    ...(id === SAMBA ? { local: 'Vevets Recepções', endereco: 'Rua Arenópolis, 82 - Candeias', cidade: 'Jaboatão dos Guararapes', uf: 'PE' } : { local: 'SEBRAE PE', endereco: 'Rua Tabajaras, 360 - Ilha do Retiro', cidade: 'Recife', uf: 'PE' }) },
    visual: { descricaoCurta: id === SAMBA ? 'Garanta seu ingresso. Ingressos na portaria por R$30.' : 'Evento sintético para teste isolado', categoria: 'Música', ...(id === SAMBA ? { descricaoCompleta: 'Compre agora. Ingressos disponíveis na portaria por R$30.', observacoes: 'Garanta já seu ingresso!', destaque: 'Ingressos na portaria por R$30.' } : {}) }, menorPreco: 'R$ 25,00', identidadeCliente: { emailObrigatorio: false },
    tipos: [{ id: 'LOCAL-TYPE', nome: 'Individual', capacidadePorVenda: 1, lotes: [{ id: 'LOCAL-LOT', nome: 'Pré-venda', preco: 'R$ 25,00', precoNumero: 25, quantidadeLimitada: false }] }] };
}
async function fixture(browser, route, mobile, options = {}) {
  const event = options.event || SAMBA, method = options.method || 'PIX';
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', permissions: [], viewport: { width: mobile ? 390 : 1440, height: 900 } });
  const page = await context.newPage(), errors = [], payments = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date(FIXTURE_NOW) });
  await context.addInitScript(({ event, method, recovery, key, order, token, retry }) => {
    localStorage.setItem('ct-public-privacy-v1', JSON.stringify({ version: 1, analytics: false, maps: true }));
    if (recovery) localStorage.setItem('CT_CHECKOUT_RECOVERY_' + event, JSON.stringify({ pedidoId: order, token }));
    if (retry) localStorage.setItem('CT_CHECKOUT_IDEMPOTENCY_' + event + '_' + method, key);
  }, { event, method, recovery: options.recover, retry: options.retry, key: KEY, order: ORDER, token: TOKEN });
  const now = () => page.evaluate(() => Date.now());
  const fixtures = createFixtures({ now });
  function order() {
    const status = options.status || 'AGUARDANDO_PAGAMENTO';
    return { sucesso: true, autorizado: true, encontrado: true, consultaToken: TOKEN,
      pedido: { pedidoId: ORDER, eventoId: event, status, expiraEm: new Date(FIXTURE_NOW + 3600000).toISOString() },
      pagamento: { forma: method, pix: { copiaECola: 'PIX-SYNTHETIC-NOT-PAYABLE' }, invoiceUrl: 'https://example.invalid/synthetic-payment' },
      ingressoEmitido: status === 'CONCLUIDO', ingressos: status === 'CONCLUIDO' ? [{ codigo: 'CT-LOCAL-TEST', link: 'https://cariocaticket.com.br/ingresso/?codigo=CT-LOCAL-TEST&sig=LOCAL-NOT-VALID' }] : [] };
  }
  fixtures.handlers['publicRpc:ctEventosPublicosListarPROD'] = async () => ({ sucesso: true, ...temporalEnvelope('home', await now()), eventos: [SAMBA, ERA].map(id => ({ ...catalog(id).evento, temporal: legacyNoEndTemporal(), visual: catalog(id).visual })), total: 2 });
  for (const rpc of ['ctEventoPublicoCarregarPROD', 'ctCheckoutPublicoCarregarEventoPROD']) fixtures.handlers['publicRpc:' + rpc] = async args => { assert.equal(args[0], event); return catalog(event, rpc === 'ctEventoPublicoCarregarPROD' ? 'detail' : 'checkout', await now()); };
  for (const rpc of ['ctCheckoutPixPublicoConsultarPROD', 'ctCheckoutPixPublicoStatusLocalPROD', 'ctCheckoutPixPublicoReconciliarPROD']) fixtures.handlers['publicRpc:' + rpc] = args => { assert.deepEqual(args, [ORDER, TOKEN]); calls.push(rpc); return order(); };
  fixtures.handlers['publicRpc:ctCheckoutPixPublicoIniciarPROD'] = args => { payments.push(args[0]); return order(); };
  fixtures.handlers['publicRpc:ctPoliticaComercialPreviewPublicoPROD'] = args => {
    const p = args[0]; assert.equal(p.eventoId, ERA); const subtotal = p.precoUnitario * p.quantidade;
    return { sucesso: true, degradado: false, rolloutAtivo: true, revisao: 'LOCAL-R1', resumo: { subtotalIngressos: subtotal, taxaCtPercentual: 10, taxaCtTotal: subtotal * .1, taxaComprador: subtotal * .1, taxaProdutor: 0, adicionaisComprador: 0, totalComprador: subtotal * 1.1, pagadorTaxa: 'COMPRADOR' } };
  };
  const e = catalog(event).evento, destination = [e.local, e.endereco, e.cidade, e.uf, 'Brasil'].join(', ');
  fixtures.resources['https://maps.google.com/maps?output=embed&q=' + encodeURIComponent(destination)] = { contentType: 'text/html', body: '<!doctype html><p>Mapa simulado offline</p>' };
  const guard = await installIsolatedNetwork(context, { root: ROOT, origin: ORIGIN, ...fixtures });
  await page.goto(ORIGIN + route + (route === '/' ? '' : '?evento=' + event));
  if (route.includes('checkout')) await page.locator('#loading').waitFor({ state: 'hidden' });
  else if (route !== '/') await page.locator('#app').waitFor({ state: 'visible' });
  return { page, context, payments, calls,
    async fill() {
      await page.locator('#typeSelect').selectOption('LOCAL-TYPE'); await page.locator('#lotSelect').selectOption('LOCAL-LOT');
      await page.locator('#buyerName').fill('Comprador Sintético'); await page.locator('#buyerCpf').fill('00000000000'); await page.locator('#buyerWhatsapp').fill('81999999999');
      if (method === 'CREDIT_CARD') await page.locator('#paymentCard').check();
    },
    async close(name) { assert.deepEqual(errors, []); await context.close(); guard.assertClean(); report.push({ name, status: 'PASS', forwarded: guard.state.forwarded, payments: payments.length, rpcs: guard.state.rpc.map(x => x.method) }); console.log('PASS ' + name); }
  };
}
async function assertEndedPresentation(page) {
  assert.equal(await page.locator('#tickets').textContent(), MESSAGE);
  for (const id of ['buyHero', 'buySide', 'buyMobile', 'buyClosing']) {
    assert.equal(await page.locator('#' + id).getAttribute('href'), '#tickets');
    assert.equal(await page.locator('#' + id).textContent(), 'Evento encerrado');
  }
  assert.equal(await page.locator('#startingPrice').textContent(), 'Evento encerrado');
  assert.equal(await page.locator('a[href*="checkout"]').count(), 0);
  assert((await page.locator('.customer-link').getAttribute('href')).includes('/minha-carioca/conta/'));
  assert(await page.locator('.journey').isHidden());
  assert(await page.locator('.secure-list').isHidden());
  assert(!/portaria|R\$\s*30|garanta|comprar|compre agora|escolha seu ingresso|pague com|pronto para viver/i.test(await page.locator('body').innerText()));
  assert((await page.locator('#longDescription').textContent()).includes('edição de 11/10/2026'));
  const message = new URL(await page.locator('#shareWhatsAppAction').getAttribute('href')).searchParams.get('text');
  assert(message.includes('Evento encerrado'));
}
async function aliasFixture(browser, js) {
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', javaScriptEnabled: js, viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  if (js) await page.clock.install({ time: new Date(FIXTURE_NOW) });
  const now = () => page.evaluate(() => Date.now());
  const fixtures = createFixtures({ now });
  fixtures.handlers['publicRpc:ctEventoPublicoCarregarPROD'] = async args => { assert.equal(args[0], SAMBA); return catalog(SAMBA, 'detail', await now()); };
  const guard = await installIsolatedNetwork(context, { root: ROOT, origin: ORIGIN, ...fixtures });
  await page.goto(ORIGIN + '/roda-de-samba/');
  if (js) {
    await page.locator('#app').waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).searchParams.get('evento'), SAMBA);
    await assertEndedPresentation(page);
  } else {
    assert((await page.locator('body').innerText()).includes('Evento encerrado em 11/10/2026.'));
    assert((await page.title()).startsWith('Evento encerrado'));
    for (const selector of ['meta[property="og:title"]','meta[name="twitter:title"]']) assert((await page.locator(selector).getAttribute('content')).startsWith('Evento encerrado'));
    assert(!/portaria|R\$\s*30/.test(await page.content()));
    assert.equal(await page.locator('noscript a').getAttribute('href'), '/evento/?evento=' + SAMBA);
    for (const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]']) assert((await page.locator(selector).getAttribute('content')).startsWith('Evento encerrado'));
    await page.screenshot({path:path.join(OUT, 'samba-alias-nojs-mobile.png'), fullPage:true});
  }
  await context.close(); guard.assertClean();
  report.push({ name: 'Samba alias ' + (js ? 'preserves redirect' : 'static content and metadata'), status: 'PASS', forwarded: guard.state.forwarded, payments: 0, rpcs: guard.state.rpc.map(x=>x.method) });
  console.log('PASS ' + report[report.length-1].name);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' } });
  try {
    for (const mobile of [false, true]) {
      const label = mobile ? 'mobile' : 'desktop';
      const home = await fixture(browser, '/', mobile);
      await home.page.waitForFunction(() => document.getElementById('events-grid').getAttribute('aria-busy') === 'false');
      assert.equal(await home.page.locator('.catalog-card').count(), 0);
      assert(await home.page.locator('#catalog-retry').isHidden());
      assert(await home.page.locator('#catalog-status').isVisible());
      assert.equal(await home.page.locator('#event-demonstration a').getAttribute('href'), '/demonstracao/roda-de-samba/');
      const samba = home.page.locator('[data-event-id="' + SAMBA + '"]');
      assert.equal(await samba.count(), 0);
      assert.equal(await home.page.locator('[data-event-id="' + ERA + '"]').count(), 0);
      await home.page.screenshot({ path: path.join(OUT, 'catalog-' + label + '.png'), fullPage: true });
      await home.close('catalog hides Samba and ERA; demonstration is separate ' + label);
      for (const route of ['/evento/', '/evento-v2/']) {
        const f = await fixture(browser, route, mobile);
        await assertEndedPresentation(f.page);
        for (const id of ['directions-map', 'directions-uber', 'directions-waze']) assert(await f.page.locator('#' + id).getAttribute('href'), id);
        const uber = await f.page.locator('#directions-uber').getAttribute('href'), waze = await f.page.locator('#directions-waze').getAttribute('href');
        assert.equal(JSON.parse(new URL(uber).searchParams.get('drop[0]')).latitude, -8.1932272); assert(waze.includes('waze.com'));
        await f.page.locator('#event-directions').scrollIntoViewIfNeeded(); await f.page.locator('#directions-map-preview iframe').waitFor();
        for (const locale of ['en-US', 'es', 'zh-Hans', 'pt-BR']) {
          await f.page.evaluate(value => CTPublicI18n.setLocale(value), locale);
          await assertEndedPresentation(f.page);
          assert.equal(await f.page.locator('#directions-uber').getAttribute('href'), uber);
        }
        assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await f.page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo({ top: 0, behavior: 'instant' }); });
        await f.page.waitForFunction(() => window.scrollY === 0);
        await f.page.screenshot({ path: path.join(OUT, route.replaceAll('/', '') + '-' + label + '-viewport.png'), animations: 'disabled' });
        await f.page.screenshot({ path: path.join(OUT, route.replaceAll('/', '') + '-' + label + '.png'), fullPage: true, animations: 'disabled' });
        await f.close(route + ' message, map, Uber, Waze, locale ' + label);
        const era = await fixture(browser, route, mobile, { event: ERA });
        assert((await era.page.locator('#buyHero').getAttribute('href')).includes('checkout'));
        assert.equal(await era.page.locator('#startingPrice').textContent(), 'R$ 25,00');
        assert(await era.page.locator('.journey').isVisible());
        assert(!(await era.page.locator('#tickets').innerText()).includes('Evento encerrado'));
        await era.close(route + ' ERA presentation remains unchanged ' + label);
      }
      for (const route of ['/checkout/', '/checkout-v2/']) {
        const f = await fixture(browser, route, mobile);
        assert.equal(await f.page.locator('#advanceSalesNotice').textContent(), MESSAGE);
        assert(!/portaria|R\$\s*30|garanta seu ingresso/i.test(await f.page.locator('body').innerText()));
        assert.equal(await f.page.locator('#eventDescription').textContent(), 'Evento encerrado em 11/10/2026.');
        assert(await f.page.locator('#payActionPanel').isHidden());
        await f.page.evaluate(() => document.getElementById('payButton').onclick());
        assert.equal(f.payments.length, 0);
        assert.equal(await f.page.evaluate(id => localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_' + id + '_PIX'), SAMBA), null);
        await f.page.locator('#modalOk').click();
        await f.page.screenshot({ path: path.join(OUT, route.replaceAll('/', '') + '-closed-' + label + '.png'), fullPage: true });
        await f.close(route + ' fresh checkout makes no request/key ' + label);
        const era = await fixture(browser, route, mobile, { event: ERA }); await era.fill();
        await era.page.locator('#feeStatus').waitFor({ state: 'hidden' });
        await era.page.locator('#payButton').click(); await era.page.locator('#pixPanel').waitFor({ state: 'visible' });
        assert.equal(era.payments.length, 1); assert.equal(era.payments[0].eventoId, ERA);
        await era.close(route + ' ERA still buys (mock only) ' + label);
      }
    }
    await aliasFixture(browser, false);
    await aliasFixture(browser, true);
    for (const route of ['/checkout/', '/checkout-v2/']) for (const method of ['PIX', 'CREDIT_CARD']) {
      const f = await fixture(browser, route, false, { method, recover: true });
      assert(await f.page.locator(method === 'PIX' ? '#pixPanel' : '#cardPanel').isVisible());
      await f.page.locator(method === 'PIX' ? '#refreshButton' : '#cardRefreshButton').click();
      assert(f.calls.includes('ctCheckoutPixPublicoConsultarPROD')); assert.equal(f.payments.length, 0);
      if (method === 'PIX') assert.equal(await f.page.locator('#pixCode').inputValue(), 'PIX-SYNTHETIC-NOT-PAYABLE');
      else assert.equal(await f.page.locator('#cardPaymentLink').getAttribute('href'), 'https://example.invalid/synthetic-payment');
      await f.close(route + ' preserves pending recovery/refresh ' + method);
      // Deliberate exclusive-contract UI expectation: an unknown result is
      // not proof of a failed order. Retain the old key, never replay creation.
      const retry = await fixture(browser, route, false, { method, retry: true });
      assert(await retry.page.locator('#catalogRecoveryAction').isVisible());
      assert.equal(await retry.page.locator('#catalogRecoveryAction').getAttribute('href'), '/minha-carioca/conta/');
      assert(await retry.page.locator('#payButton').isDisabled());
      // Invoke the handler directly too; disabled markup alone is insufficient.
      await retry.page.evaluate(() => document.getElementById('payButton').onclick());
      assert.equal(retry.payments.length, 0);
      assert.equal(await retry.page.evaluate(({ event, method }) => localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_' + event + '_' + method), { event: SAMBA, method }), KEY);
      assert.equal(await retry.page.evaluate(({ event, method }) => localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_' + event + '_' + method), { event: SAMBA, method: method === 'PIX' ? 'CREDIT_CARD' : 'PIX' }), null);
      await retry.close(route + ' lost-response recovery preserves saved key without recreation ' + method);
    }
    for (const route of ['/checkout/', '/checkout-v2/']) for (const status of ['CONCLUIDO', 'EXPIRADO', 'CANCELADO']) {
      const f = await fixture(browser, route, false, { recover: true, status });
      assert(await f.page.locator(status === 'CONCLUIDO' ? '#successPanel' : '#closedPanel').isVisible());
      assert.equal(f.payments.length, 0);
      if (status === 'CONCLUIDO') assert.equal(await f.page.locator('#ticketLinks a').count(), 1);
      else assert.equal(await f.page.locator('#closedMessage').textContent(), MESSAGE);
      await f.close(route + ' existing order ' + status);
    }
    console.log('PASS ' + report.length + ' isolated browser cases; zero requests forwarded.');
  } finally { fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
