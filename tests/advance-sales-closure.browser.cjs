'use strict';
// Actual HTML/assets + local RPC fixtures. Offline, unreachable proxy, blocked
// service workers, deny-all network guard: no live RPC/provider/map/charge/ticket.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { installIsolatedNetwork } = require('./safety/isolated-network.cjs');
const { createFixtures } = require('./fixtures/public-canary.cjs');
const ROOT = path.resolve(__dirname, '..'), ORIGIN = 'http://127.0.0.1:4179';
const SAMBA = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD', ERA = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
const MESSAGE = 'Vendas antecipadas encerradas. Ingressos disponíveis na portaria por R$30.';
const ORDER = 'ORDER-SYNTHETIC', TOKEN = 'TOKEN-SYNTHETIC', KEY = 'KEY-SYNTHETIC-PRE-CLOSURE';
const OUT = process.env.CT_EVIDENCE_DIR || 'test-results/advance-sales';
const report = [];
function catalog(id) {
  return { sucesso: true, evento: { id, nome: id === SAMBA ? 'Roda de Samba Estilo Carioca' : 'ERA BEAUTY', data: '11/10/2026', horario: '15h',
    ...(id === SAMBA ? { local: 'Vevets Recepções', endereco: 'Rua Arenópolis, 82 - Candeias', cidade: 'Jaboatão dos Guararapes', uf: 'PE' } : { local: 'SEBRAE PE', endereco: 'Rua Tabajaras, 360 - Ilha do Retiro', cidade: 'Recife', uf: 'PE' }) },
    visual: { descricaoCurta: 'Evento sintético para teste isolado', categoria: 'Música' }, menorPreco: 'R$ 25,00', identidadeCliente: { emailObrigatorio: false },
    tipos: [{ id: 'LOCAL-TYPE', nome: 'Individual', capacidadePorVenda: 1, lotes: [{ id: 'LOCAL-LOT', nome: 'Pré-venda', preco: 'R$ 25,00', precoNumero: 25, quantidadeLimitada: false }] }] };
}
async function fixture(browser, route, mobile, options = {}) {
  const event = options.event || SAMBA, method = options.method || 'PIX';
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', permissions: [], viewport: { width: mobile ? 390 : 1440, height: 900 } });
  const page = await context.newPage(), errors = [], payments = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(({ event, method, recovery, key, order, token, retry }) => {
    localStorage.setItem('ct-public-privacy-v1', JSON.stringify({ version: 1, analytics: false, maps: true }));
    if (recovery) localStorage.setItem('CT_CHECKOUT_RECOVERY_' + event, JSON.stringify({ pedidoId: order, token }));
    if (retry) localStorage.setItem('CT_CHECKOUT_IDEMPOTENCY_' + event + '_' + method, key);
  }, { event, method, recovery: options.recover, retry: options.retry, key: KEY, order: ORDER, token: TOKEN });
  const fixtures = createFixtures();
  function order() {
    const status = options.status || 'AGUARDANDO_PAGAMENTO';
    return { sucesso: true, autorizado: true, encontrado: true, consultaToken: TOKEN,
      pedido: { pedidoId: ORDER, eventoId: event, status, expiraEm: new Date(Date.now() + 3600000).toISOString() },
      pagamento: { forma: method, pix: { copiaECola: 'PIX-SYNTHETIC-NOT-PAYABLE' }, invoiceUrl: 'https://example.invalid/synthetic-payment' },
      ingressoEmitido: status === 'CONCLUIDO', ingressos: status === 'CONCLUIDO' ? [{ codigo: 'CT-LOCAL-TEST', link: 'https://cariocaticket.com.br/ingresso/?codigo=CT-LOCAL-TEST&sig=LOCAL-NOT-VALID' }] : [] };
  }
  fixtures.handlers['publicRpc:ctEventosPublicosListarPROD'] = () => ({ sucesso: true, eventos: [SAMBA, ERA].map(id => ({ ...catalog(id).evento, visual: catalog(id).visual })), total: 2 });
  for (const rpc of ['ctEventoPublicoCarregarPROD', 'ctCheckoutPublicoCarregarEventoPROD']) fixtures.handlers['publicRpc:' + rpc] = args => { assert.equal(args[0], event); return catalog(event); };
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
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' } });
  try {
    for (const mobile of [false, true]) {
      const label = mobile ? 'mobile' : 'desktop';
      const home = await fixture(browser, '/', mobile);
      await home.page.locator('.catalog-card').first().waitFor();
      assert.equal(await home.page.locator('.catalog-card').count(), 2);
      const samba = home.page.locator('[data-event-id="' + SAMBA + '"]');
      assert((await samba.innerText()).includes(MESSAGE)); assert.equal(await samba.locator('a[href^="/checkout/"]').count(), 0);
      assert.equal(await home.page.locator('[data-event-id="' + ERA + '"] a[href^="/checkout/"]').count(), 1);
      await home.page.screenshot({ path: path.join(OUT, 'catalog-' + label + '.png'), fullPage: true });
      await home.close('catalog keeps both events; only Samba closed ' + label);
      for (const route of ['/evento/', '/evento-v2/']) {
        const f = await fixture(browser, route, mobile);
        assert.equal(await f.page.locator('#tickets').textContent(), MESSAGE);
        for (const id of ['buyHero', 'buySide', 'buyMobile', 'buyClosing']) assert.equal(await f.page.locator('#' + id).getAttribute('href'), '#tickets');
        for (const id of ['directions-map', 'directions-uber', 'directions-waze']) assert(await f.page.locator('#' + id).getAttribute('href'), id);
        const uber = await f.page.locator('#directions-uber').getAttribute('href'), waze = await f.page.locator('#directions-waze').getAttribute('href');
        assert.equal(JSON.parse(new URL(uber).searchParams.get('drop[0]')).latitude, -8.1932272); assert(waze.includes('waze.com'));
        await f.page.locator('#event-directions').scrollIntoViewIfNeeded(); await f.page.locator('#directions-map-preview iframe').waitFor();
        await f.page.evaluate(() => CTPublicI18n.setLocale('en-US'));
        assert.equal(await f.page.locator('#tickets').textContent(), MESSAGE); assert.equal(await f.page.locator('#directions-uber').getAttribute('href'), uber);
        await f.page.evaluate(() => CTPublicI18n.setLocale('pt-BR'));
        assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await f.page.screenshot({ path: path.join(OUT, route.replaceAll('/', '') + '-' + label + '.png'), fullPage: true });
        await f.close(route + ' message, map, Uber, Waze, locale ' + label);
      }
      for (const route of ['/checkout/', '/checkout-v2/']) {
        const f = await fixture(browser, route, mobile);
        assert.equal(await f.page.locator('#advanceSalesNotice').textContent(), MESSAGE);
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
    for (const route of ['/checkout/', '/checkout-v2/']) for (const method of ['PIX', 'CREDIT_CARD']) {
      const f = await fixture(browser, route, false, { method, recover: true });
      assert(await f.page.locator(method === 'PIX' ? '#pixPanel' : '#cardPanel').isVisible());
      await f.page.locator(method === 'PIX' ? '#refreshButton' : '#cardRefreshButton').click();
      assert(f.calls.includes('ctCheckoutPixPublicoConsultarPROD')); assert.equal(f.payments.length, 0);
      if (method === 'PIX') assert.equal(await f.page.locator('#pixCode').inputValue(), 'PIX-SYNTHETIC-NOT-PAYABLE');
      else assert.equal(await f.page.locator('#cardPaymentLink').getAttribute('href'), 'https://example.invalid/synthetic-payment');
      await f.close(route + ' preserves pending recovery/refresh ' + method);
      const retry = await fixture(browser, route, false, { method, retry: true }); await retry.fill();
      await retry.page.locator('#payButton').click(); await retry.page.locator(method === 'PIX' ? '#pixPanel' : '#cardPanel').waitFor({ state: 'visible' });
      assert.equal(retry.payments.length, 1); assert.equal(retry.payments[0].idempotenciaChave, KEY);
      await retry.close(route + ' lost-response retry reuses saved key ' + method);
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
