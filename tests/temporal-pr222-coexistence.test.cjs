'use strict';
// Pinned-main PR222 behavior exercised with actual page/closure/share/i18n scripts.
// Node VM and synthetic in-memory adapters only. No browser, network, provider,
// actual order, real token, payment, native share, or production state is involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, catalog, order, PENDING, START } = require('./helpers/public-pages-offline.cjs');
const SAMBA = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const BUY = ['buyHero', 'buySide', 'buyMobile', 'buyClosing'];
function closedCatalog(now = 0, ttl = 1000) {
  return catalog(now, ttl, 'A', SAMBA, {
    evento: { id: SAMBA, nome: 'Roda de Samba Estilo Carioca', data: '11/10/2026', horario: '15h', local: 'Fixture only' },
    visual: { descricaoCurta: 'Garanta seu ingresso. Ingressos na portaria por R$30.', descricaoCompleta: 'Compre agora. Ingressos disponíveis na portaria por R$30.', observacoes: 'Garanta já seu ingresso!', destaque: 'Ingressos na portaria por R$30.' }
  });
}
function closedOrder(method = 'PIX', status = 'AGUARDANDO_PAGAMENTO') {
  const result = order(method, status); result.pedido.eventoId = SAMBA; return result;
}
function assertClosed(f) {
  assert(f.visible('app'));
  for (const id of BUY) {
    assert.equal(f.element(id).textContent, 'Evento encerrado', id);
    assert.equal(f.element(id).href, '#tickets', id + ' remains an information anchor, not checkout');
  }
  assert.equal(f.element('startingPrice').textContent, 'Evento encerrado');
  assert.equal(f.element('tickets').textContent, 'Evento encerrado.');
  assert.equal(f.element('highlight').textContent, 'Evento encerrado.');
  assert.equal(f.element('shortDescription').textContent, 'Evento encerrado em 11/10/2026.');
  assert.match(f.element('longDescription').textContent, /edição de 11\/10\/2026.*encerrada/);
  assert.equal(f.element('notes').textContent, 'Para consultar ingressos já adquiridos, use Meus ingressos.');
  assert.equal(f.document.querySelector('.journey').closest('article').classList.contains('hidden'), true);
  assert.equal(f.document.querySelector('.secure-list').classList.contains('hidden'), true);
  assert.equal(f.document.querySelector('.trust').classList.contains('hidden'), true);
  const account = f.document.querySelector('.customer-link');
  assert.match(account.href, /\/minha-carioca\/conta\//);
  for (const link of f.document.querySelectorAll('a')) assert(!String(link.href || '').includes('/checkout'), 'No checkout href after closure');
  const whatsapp = new URL(f.element('shareWhatsAppAction').href).searchParams.get('text');
  assert.match(whatsapp, /Roda de Samba Estilo Carioca — Evento encerrado/);
  assert(!/portaria|R\$\s*30/.test(whatsapp));
}
for (const route of ['evento', 'evento-v2']) {
  test(route + ': PR222 closed text, account, share and hidden sales sections coexist with exclusive contract', async () => {
    const f = fixture(route, { eventId: SAMBA, languages: true, nativeShare: true, catalog: () => closedCatalog() });
    assertClosed(f);
    f.click('shareNativeAction'); await Promise.resolve();
    assert.equal(f.state.shares.length, 1);
    assert.match(f.state.shares[0].title, /Evento encerrado/);
    assert.equal(f.state.shares[0].text, 'Evento encerrado. Informações de referência da Roda de Samba Estilo Carioca.');
    for (const locale of ['en-US', 'es', 'zh-Hans', 'pt-BR']) { f.sandbox.CTPublicI18n.setLocale(locale); assertClosed(f); }
    assert.equal(f.state.payments.length, 0); assert.equal(f.state.catalogs.length, 1); f.finish();
  });
  test(route + ': PR222 information anchors survive exclusive end, delayed handlers and suspension', () => {
    const f = fixture(route, { eventId: SAMBA, catalog: () => closedCatalog() });
    f.delay(1000);
    for (const event of ['click', 'auxclick', 'contextmenu', 'dragstart']) { f.dispatch('buyHero', event); assertClosed(f); }
    for (const key of ['Enter', ' ']) { f.dispatch('buyMobile', 'keydown', { key }); assertClosed(f); }
    f.clock.tick(0); assertClosed(f);
    f.visibility('hidden'); assertClosed(f); f.signal('pagehide'); assertClosed(f);
    f.visibility('visible'); f.signal('pageshow', { persisted: true }); f.signal('focus'); assertClosed(f);
    assert.equal(f.state.payments.length, 0); f.finish();
  });
  for (const outcome of ['fresh', 'legacy', 'transport']) test(route + ': PR222 closure survives bounded refresh ' + outcome, () => {
    const f = fixture(route, { eventId: SAMBA, languages: true, catalog: (call, count, clock) => {
      if (count === 1) return closedCatalog();
      if (outcome === 'legacy') { const c = closedCatalog(clock.elapsed); delete c.eligibilityContract; return c; }
      if (outcome === 'transport') throw Error('SYNTHETIC_TRANSPORT_ERROR');
      return closedCatalog(clock.elapsed, 60000);
    } });
    f.clock.tick(1000); assertClosed(f); f.clock.tick(4000);
    assert.equal(f.state.catalogs.length, 2); assertClosed(f);
    for (const locale of ['en-US', 'es', 'zh-Hans', 'pt-BR']) { f.sandbox.CTPublicI18n.setLocale(locale); assertClosed(f); }
    assert.equal(f.state.payments.length, 0); f.finish();
  });
}
for (const route of ['checkout', 'checkout-v2']) {
  test(route + ': PR222 ended description/panels and exact modal block every new sale', () => {
    const f = fixture(route, { eventId: SAMBA, catalog: () => closedCatalog() });
    assert.equal(f.element('eventDescription').textContent, 'Evento encerrado em 11/10/2026.');
    assert.equal(f.element('advanceSalesNotice').textContent, 'Evento encerrado.');
    for (const id of ['salePanel', 'buyerPanel', 'payActionPanel']) assert(!f.visible(id));
    // The existing V2 amount-confirmation guard precedes its closure modal.
    // Select only synthetic in-memory data so both routes reach the closure guard.
    f.fill(); f.clock.tick(180);
    f.dispatch('payButton', 'click'); assert.equal(f.element('modalTitle').textContent, 'Evento encerrado');
    assert.equal(f.state.payments.length, 0);
    f.clock.tick(1000); f.visibility('hidden'); f.signal('pagehide'); f.visibility('visible'); f.clock.tick(4000);
    for (const id of ['salePanel', 'buyerPanel', 'payActionPanel']) assert(!f.visible(id));
    assert.equal(f.element('eventDescription').textContent, 'Evento encerrado em 11/10/2026.');
    f.dispatch('payButton', 'click'); assert.equal(f.state.payments.length, 0); f.finish();
  });
  for (const method of ['PIX', 'CREDIT_CARD']) test(route + ': PR222 existing ' + method + ' order preserves TTL/polling through temporal end', () => {
    const f = fixture(route, { eventId: SAMBA, recovery: true, method, catalog: () => closedCatalog(),
      recover: () => closedOrder(method), poll: () => closedOrder(method), reconcile: () => closedOrder(method) });
    assert.equal(f.state.recoveries.length, 1);
    const panel = method === 'PIX' ? 'pixPanel' : 'cardPanel'; assert(f.visible(panel));
    const link = method === 'PIX' ? f.element('pixCode').value : f.element('cardPaymentLink').href;
    f.clock.tick(6000); f.visibility('hidden'); f.signal('pagehide'); f.visibility('visible'); f.signal('pageshow', { persisted: true }); f.clock.tick(50);
    assert.equal(f.state.catalogs.length, 1); assert.equal(f.state.payments.length, 0); assert(f.state.polls.length > 0);
    assert(f.visible(panel)); assert.equal(method === 'PIX' ? f.element('pixCode').value : f.element('cardPaymentLink').href, link);
    assert.match(f.element(method === 'PIX' ? 'expiryText' : 'cardExpiryText').textContent, /1:5[34]/); f.finish();
  });
  test(route + ': PR222 issued ticket survives end; unknown key is retained without recreation', () => {
    const f = fixture(route, { eventId: SAMBA, recovery: true, catalog: () => closedCatalog(), recover: () => closedOrder('PIX', 'CONCLUIDO') });
    assert(f.visible('successPanel')); f.clock.tick(6000); f.signal('pageshow', { persisted: true }); assert(f.visible('successPanel')); assert.equal(f.state.payments.length, 0); f.finish();
    const pending = fixture(route, { eventId: SAMBA, savedAttempt: true });
    assert(pending.visible('catalogRecoveryAction')); pending.dispatch('payButton', 'click'); pending.clock.tick(6000);
    assert.equal(pending.state.catalogs.length, 0); assert.equal(pending.state.payments.length, 0);
    assert.equal(pending.sandbox.localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_' + SAMBA + '_PIX'), 'SYNTHETIC-KEY'); pending.finish();
  });
}
