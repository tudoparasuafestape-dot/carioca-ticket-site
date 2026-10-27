'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, catalog, order, PENDING, EVENT, START } = require('./helpers/public-pages-offline.cjs');
const routes = ['evento', 'evento-v2', 'checkout', 'checkout-v2'];
const isCheckout = route => route.startsWith('checkout');
const blocked = f => isCheckout(f.route) ? f.element('payButton').disabled : !f.element('buyHero').href;
const fresh = f => isCheckout(f.route) ? !f.element('typeSelect').disabled : !!f.element('buyHero').href;
for (const route of routes) {
  test(route + ': real inline scripts render a valid server catalog', () => {
    const f = fixture(route); assert(f.visible(isCheckout(route) ? 'salePanel' : 'app')); assert(fresh(f)); assert.equal(f.state.catalogs.length, 1); f.finish();
  });
  for (const missing of ['clock', 'envelope']) test(route + ': missing ' + missing + ' is fail closed', () => {
    const f = fixture(route, { missingClock: missing === 'clock', catalog: () => catalog(0, 60000, 'A', EVENT, missing === 'envelope' ? { temporalVersion: undefined } : {}) });
    assert(blocked(f) || !f.visible(isCheckout(route) ? 'salePanel' : 'app')); assert.equal(f.state.payments.length, 0); f.finish();
  });
  test(route + ': initial response consumed by transit cannot mount a buyable offer', () => {
    const f = fixture(route, { catalog: () => PENDING }); f.delay(1000); f.state.catalogs[0].resolve(catalog(0, 1000));
    assert(blocked(f) || !f.visible(isCheckout(route) ? 'salePanel' : 'app')); assert.equal(f.state.payments.length, 0); f.finish();
  });
  test(route + ': nextTransitionAt closes offers exactly at the boundary', () => {
    const f = fixture(route, { catalog: () => catalog(0, 1000, 'A', EVENT, { nextTransitionAt: new Date(START + 1000).toISOString() }) });
    f.clock.tick(999); assert(fresh(f)); f.clock.tick(1); assert(blocked(f)); assert.equal(f.state.catalogs.length, 1); f.finish();
  });
  test(route + ': backward and forward client wall time do not define catalog eligibility', () => {
    const f = fixture(route, { catalog: () => catalog(0, 1000) });
    f.clock.now += 86400000; assert(fresh(f)); f.clock.now -= 172800000; assert(fresh(f));
    f.clock.elapsed = 1000;
    if (isCheckout(route)) f.dispatch('payButton', 'click'); else f.dispatch('buyHero', 'click');
    assert(blocked(f)); assert.equal(f.state.payments.length, 0); f.finish();
  });
  test(route + ': cached response cannot renew the conservative lease', () => {
    const f = fixture(route, { catalog: () => catalog(0, 6000) }); f.clock.tick(5000); f.signal('focus'); f.clock.tick(50);
    assert.equal(f.state.catalogs.length, 2); assert(fresh(f)); f.clock.tick(950); assert(blocked(f)); f.finish();
  });
  test(route + ': older server/evaluation response cannot re-enable suspended sale', () => {
    const f = fixture(route, { catalog: (call, count) => catalog(count === 1 ? 1000 : 0, 60000) });
    f.clock.tick(5000); f.signal('focus'); f.clock.tick(50); assert.equal(f.state.catalogs.length, 2); assert(blocked(f)); f.finish();
  });
  test(route + ': visibility, pagehide and BFCache resume invalidate before refresh', () => {
    const f = fixture(route, { catalog: (call, count, clock) => count === 1 ? catalog(clock.elapsed) : PENDING });
    f.visibility('hidden'); assert(blocked(f)); f.clock.tick(10000); assert.equal(f.state.catalogs.length, 1);
    f.visibility('visible'); assert(blocked(f)); f.signal('pageshow', { persisted: true }); f.signal('focus'); f.signal('online');
    f.clock.tick(50); assert.equal(f.state.catalogs.length, 2); f.state.catalogs[1].resolve(catalog(10050)); assert(fresh(f));
    f.signal('pagehide'); assert(blocked(f)); f.finish();
  });
  test(route + ': short valid leases and resume bursts never make a 50 ms request loop', () => {
    const f = fixture(route, { catalog: (call, count, clock) => catalog(clock.elapsed, 1) });
    for (let i = 0; i < 10; i++) { f.signal('focus'); f.signal('online'); f.signal('pageshow', { persisted: true }); }
    f.clock.tick(20000); assert(f.state.catalogs.length <= 5);
    const times = f.state.catalogs.map(c => c.at); for (let i = 1; i < times.length; i++) assert(times[i] - times[i - 1] >= 5000, times.join(',')); f.finish();
  });
}
for (const route of ['evento', 'evento-v2']) {
  for (const [type, key] of [['click'], ['auxclick'], ['contextmenu'], ['dragstart'], ['keydown', 'Enter'], ['keydown', ' ']]) {
    test(route + ': delayed timer still blocks ' + type + (key || ''), () => {
      const f = fixture(route, { catalog: () => catalog(0, 1000) }); assert(fresh(f)); f.delay(1000);
      const action = f.dispatch('buyHero', type, { key }); assert(action.defaultPrevented); assert(blocked(f));
      for (const id of ['buyHero', 'buySide', 'buyMobile', 'buyClosing']) { assert(!f.element(id).href); assert.equal(f.element(id).getAttribute('aria-disabled'), 'true'); }
      assert.equal(f.element('startingPrice').textContent, 'Consulte'); f.finish();
    });
  }
  test(route + ': fresh empty catalog keeps event details and disables every buy link', () => {
    const f = fixture(route, { catalog: () => catalog(0, 60000, 'NONE') }); assert(f.visible('app')); assert(blocked(f)); assert.equal(f.element('eventName').textContent, 'Synthetic local event'); f.finish();
  });
}
for (const route of ['checkout', 'checkout-v2']) {
  test(route + ': expiry preserves buyer data and does not auto-select the next lot', () => {
    const f = fixture(route, { catalog: (call, count, clock) => { const response = catalog(clock.elapsed, count === 1 ? 1000 : 60000, count === 1 ? 'A' : 'B'); response.tipos[0].capacidadePorVenda = 2; return response; } });
    f.fill(); f.document.querySelectorAll('[data-name]')[0].value = 'Local synthetic participant';
    f.document.querySelectorAll('[data-phone]')[0].value = '81988888888'; f.clock.tick(1000); assert(blocked(f)); assert.equal(f.element('buyerName').value, 'Local synthetic buyer');
    f.clock.tick(4000); assert.equal(f.state.catalogs.length, 2); assert(fresh(f));
    assert(f.element('lotSelect').children.some(n => n.value === 'B')); assert.notEqual(f.element('lotSelect').value, 'B');
    assert.equal(f.document.querySelectorAll('[data-name]')[0].value, 'Local synthetic participant');
    assert.equal(f.document.querySelectorAll('[data-phone]')[0].value, '81988888888');
    f.click('payButton'); assert.equal(f.state.payments.length, 0); assert.equal(f.element('buyerName').value, 'Local synthetic buyer'); f.finish();
  });
  test(route + ': stale enabled pay button cannot send a payment when timer is delayed', () => {
    const f = fixture(route, { catalog: () => catalog(0, 1000) }); f.fill(); f.delay(1000); f.dispatch('payButton', 'click');
    assert(blocked(f)); assert.equal(f.state.payments.length, 0); f.finish();
  });
  test(route + ': late coupon cannot restore stale promotion', () => {
    const f = fixture(route, { catalog: () => catalog(0, 1000), coupon: () => PENDING }); f.fill(); f.element('couponCode').value = 'LOCAL'; f.click('couponApply');
    assert.equal(f.state.coupons.length, 1); f.delay(1000); f.state.coupons[0].resolve({ sucesso: true, valido: true, cupom: { codigo: 'LOCAL' }, calculo: { valorOriginalTotal: 25, valorFinalTotal: 20, descontoTotal: 5 } });
    assert(blocked(f)); assert(!f.visible('promoSummary')); assert.equal(f.state.payments.length, 0); f.finish();
  });
  for (const method of ['PIX', 'CREDIT_CARD']) test(route + ': existing ' + method + ' order retains payment TTL and polling beyond catalog end', () => {
    const f = fixture(route, { recovery: true, method, catalog: () => catalog(0, 1000) });
    assert.equal(f.state.recoveries.length, 1); assert(f.visible(method === 'PIX' ? 'pixPanel' : 'cardPanel'));
    const link = method === 'PIX' ? f.element('pixCode').value : f.element('cardPaymentLink').href;
    f.clock.tick(6000); f.visibility('hidden'); f.signal('pagehide'); f.visibility('visible'); f.signal('pageshow', { persisted: true }); f.clock.tick(50);
    assert.equal(f.state.catalogs.length, 1); assert.equal(f.state.payments.length, 0); assert(f.state.polls.length > 0);
    assert.equal(method === 'PIX' ? f.element('pixCode').value : f.element('cardPaymentLink').href, link);
    assert.match(f.element(method === 'PIX' ? 'expiryText' : 'cardExpiryText').textContent, /1:5[34]/); f.finish();
  });
  test(route + ': known order recovery works even when catalog envelope is unavailable', () => {
    const f = fixture(route, { recovery: true, catalog: () => ({ sucesso: false }) });
    assert.equal(f.state.recoveries.length, 1); assert(f.visible('pixPanel')); assert.equal(f.state.payments.length, 0); f.finish();
  });
  test(route + ': already-issued ticket survives catalog expiry and resume', () => {
    const f = fixture(route, { recovery: true, catalog: () => catalog(0, 1000), recover: () => order('PIX', 'CONCLUIDO') });
    assert(f.visible('successPanel')); f.clock.tick(6000); f.signal('pageshow', { persisted: true }); assert(f.visible('successPanel'));
    assert.equal(f.state.catalogs.length, 1); assert.equal(f.state.payments.length, 0); f.finish();
  });
  test(route + ': pending payment and lost response never authorize a second payment or key', () => {
    const f = fixture(route, { catalog: () => catalog(0, 1000), pay: () => PENDING }); f.fill(); f.click('payButton');
    assert.equal(f.state.payments.length, 1); const key = f.state.payments[0].args[0].idempotenciaChave;
    f.clock.tick(6000); f.signal('focus'); assert.equal(f.state.catalogs.length, 1);
    f.state.payments[0].reject(new Error('SYNTHETIC_TRANSPORT_TIMEOUT')); assert(f.visible('catalogRecoveryAction'));
    f.element('paymentCard').checked = true; f.dispatch('paymentCard', 'change'); f.dispatch('payButton', 'click');
    assert.equal(f.state.payments.length, 1); assert.equal(f.sandbox.localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_' + EVENT + '_PIX'), key);
    assert.equal(f.sandbox.localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_' + EVENT + '_CREDIT_CARD'), null); f.finish();
  });
  test(route + ': reload with unresolved key blocks catalog and new payment', () => {
    const f = fixture(route, { savedAttempt: true }); assert(f.visible('catalogRecoveryAction')); f.dispatch('payButton', 'click');
    f.clock.tick(10000); f.signal('focus'); assert.equal(f.state.catalogs.length, 0); assert.equal(f.state.payments.length, 0); f.finish();
  });
}
for (const route of ['evento-v2', 'checkout-v2']) test(route + ': existing access parameters and campaign semantics survive refresh without new persistence', () => {
  const grant = Buffer.from(JSON.stringify({ i: 'SYNTHETIC-INVITE' })).toString('base64url') + '.LOCAL';
  const f = fixture(route, { query: '&privado=1&accessGrant=' + encodeURIComponent(grant) + '&cupom=LOCAL&src=LOCAL&csid=SYNTHETIC-SESSION',
    catalog: (call, count, clock) => catalog(clock.elapsed, count === 1 ? 1000 : 60000) });
  const campaigns = f.state.campaigns.length; f.clock.tick(5000); assert.equal(f.state.catalogs.length, 2);
  for (const call of f.state.catalogs) {
    if (route === 'checkout-v2') assert.equal(call.args[1], grant);
    else assert.deepEqual(call.args, [EVENT], 'Public event detail remains public, without forwarding a private grant');
  }
  assert.equal(f.state.campaigns.length, campaigns); assert(campaigns <= 1);
  for (const storage of [f.sandbox.localStorage, f.sandbox.sessionStorage]) for (const [key, value] of storage.data) assert(!value.includes(grant), key); f.finish();
});
for (const route of routes) test(route + ': suspended in-flight response cannot restore a fresh catalog', () => {
  const f = fixture(route, { catalog: () => PENDING }); f.visibility('hidden'); f.delay(500);
  f.state.catalogs[0].resolve(catalog(0)); assert(blocked(f) || !f.visible(isCheckout(route) ? 'salePanel' : 'app'));
  f.visibility('visible'); f.signal('focus'); f.clock.tick(4500); assert.equal(f.state.catalogs.length, 2);
  f.state.catalogs[1].resolve(catalog(5000)); assert(fresh(f)); f.finish();
});
for (const route of ['checkout', 'checkout-v2']) test(route + ': late fee quote rejects the expired lot before applying any amount', () => {
  const f = fixture(route, { eventId: 'EVT-23112026-ERA-BEAUTY-EAC4B673', catalog: () => catalog(0, 1000, 'A', EVENT, { politicaComercial: { ativa: true } }), preview: () => PENDING });
  f.fill(); f.clock.tick(180); assert(f.state.previews.length > 0); f.delay(820);
  f.state.previews.at(-1).resolve({ sucesso: true, degradado: false, rolloutAtivo: true, revisao: 'LOCAL', resumo: {} });
  assert(blocked(f)); assert(!f.visible('feeSummary')); assert.equal(f.state.payments.length, 0); f.finish();
});
for (const route of ['evento', 'evento-v2']) test(route + ': a denied public read cannot render private event fields', () => {
  const f = fixture(route, { catalog: () => catalog(0, 60000, 'A', EVENT, { sucesso: false, evento: { nome: 'PRIVATE-SYNTHETIC-FIELD' } }) });
  assert(!f.visible('app')); assert(!f.element('eventName').textContent.includes('PRIVATE-SYNTHETIC-FIELD')); f.finish();
});

for (const route of routes) {
  test(route + ': stale clock implementation under new asset URL is fail closed', () => {
    const f = fixture(route, { legacyClock: true });
    assert(blocked(f) || !f.visible(isCheckout(route) ? 'salePanel' : 'app'));
    assert.equal(f.state.payments.length, 0); f.finish();
  });
  for (const [label, contract] of [['missing', undefined], ['null', null], ['old', 'CT_PUBLIC_ELIGIBILITY_INCLUSIVE_V1'], ['unknown', 'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V2'], ['number', 1], ['object', {}], ['whitespace', 'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1 ']]) {
    test(route + ': rejects ' + label + ' eligibility even under new namespace', () => {
      const f = fixture(route, { catalog: () => catalog(0, 60000, 'A', EVENT, { eligibilityContract: contract }) });
      assert(blocked(f) || !f.visible(isCheckout(route) ? 'salePanel' : 'app'));
      f.dispatch(isCheckout(route) ? 'payButton' : 'buyHero', 'click');
      assert.equal(f.state.payments.length, 0); f.finish();
    });
    test(route + ': memory cannot fall back to a valid old offer after ' + label + ' refresh', () => {
      const f = fixture(route, { catalog: (call, count, clock) => catalog(clock.elapsed, 60000, 'A', EVENT, count === 1 ? {} : { eligibilityContract: contract }) });
      assert(fresh(f)); f.signal('pageshow', { persisted: true }); assert(blocked(f));
      f.clock.tick(5000); assert.equal(f.state.catalogs.length, 2); assert(blocked(f));
      f.dispatch(isCheckout(route) ? 'payButton' : 'buyHero', 'click');
      assert.equal(f.state.payments.length, 0); f.finish();
    });
  }
}
for (const route of ['checkout', 'checkout-v2']) for (const method of ['PIX', 'CREDIT_CARD']) test(route + ': old-contract response still permits existing ' + method + ' recovery', () => {
  const f = fixture(route, { recovery: true, method, catalog: () => catalog(0, 60000, 'A', EVENT, { eligibilityContract: undefined }) });
  assert.equal(f.state.recoveries.length, 1); assert(f.visible(method === 'PIX' ? 'pixPanel' : 'cardPanel'));
  f.clock.tick(6000); assert(f.state.polls.length > 0); assert.equal(f.state.payments.length, 0); f.finish();
});

for (const route of routes) {
  const checkoutProfile = isCheckout(route);
  const normalMax = checkoutProfile ? 120000 : 300000;
  for (const [label, ttl, patch, allowed] of [
    ['exact normal maximum', normalMax, {}, true],
    ['over normal maximum', normalMax + 1, {}, false],
    ['exact stale maximum', 600000, {cacheStale: true}, checkoutProfile],
    ['over stale maximum', 600001, {cacheStale: true}, false],
    ['string stale flag', 600000, {cacheStale: 'true'}, false],
    ['24 hour lease', 86400000, {}, false],
    ['deadline exceeds transition', 60000, {nextTransitionAt: new Date(START + 1000).toISOString()}, false],
    ['advanced server cannot refresh evaluation age', normalMax + 1, {serverNow: new Date(START + normalMax - 1).toISOString()}, false]
  ]) test(route + ': profile gate ' + label, () => {
    const f = fixture(route, {catalog: () => catalog(0, ttl, 'A', EVENT, patch)});
    if (allowed) assert(fresh(f)); else assert(blocked(f) || !f.visible(checkoutProfile ? 'salePanel' : 'app'));
    assert.equal(f.state.payments.length, 0); f.finish();
  });
}
