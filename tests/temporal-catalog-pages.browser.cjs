'use strict';
// Full candidate HTML + assets. All RPC responses are synthetic. The shared
// fail-closed guard, offline contexts and unreachable proxy forbid live traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { installIsolatedNetwork } = require('./safety/isolated-network.cjs');
const { mockRoute } = require('./safety/declared-mocks.cjs');
const { createFixtures } = require('./fixtures/public-canary.cjs');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1:43022';
const EVENT = 'EVT-LOCAL-TEMPORAL';
const ORDER = 'ORDER-LOCAL-TEMPORAL', TOKEN = 'LOCAL-TEMPORAL-TOKEN';
const GRANT = 'eyJpIjoiSU5WLVRFTVBPUkFMIn0.LOCAL-NOT-A-SIGNATURE';
const OUT = path.join(ROOT, 'test-results/temporal-catalog');
const report = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  const end = Date.now() + 7000;
  while (Date.now() < end) { if (await check()) return; await delay(15); }
  assert.fail(label);
}
function envelope(ttl = 60000) {
  const now = Date.now();
  return { temporalVersion: 1, temporalEvaluatedAt: new Date(now).toISOString(),
    serverNow: new Date(now).toISOString(), nextTransitionAt: new Date(now + ttl).toISOString(),
    validUntil: new Date(now + ttl).toISOString() };
}
function catalog(lot = 'A', ttl = 60000, eventId = EVENT, policy = false) {
  const price = lot === 'A' ? 25 : 40;
  return { sucesso: true, ...envelope(ttl),
    evento: { id: eventId, nome: 'Evento temporal sintético', data: '20/12/2030', horario: '18h às 22h', local: 'Local sintético', cidade: 'Recife', uf: 'PE' },
    visual: { descricaoCurta: 'Fixture temporal isolada', categoria: 'Teste', realizacao: 'Teste' },
    menorPreco: lot === 'NONE' ? '' : 'R$ ' + price + ',00',
    tipos: lot === 'NONE' ? [] : [{ id: 'TYPE', nome: 'Individual', capacidadePorVenda: 1,
      lotes: [{ id: lot, nome: 'Lote ' + lot, preco: 'R$ ' + price + ',00',
        precoNumero: price, quantidadeLimitada: false, disponiveis: 100 }] }],
    identidadeCliente: { emailObrigatorio: false }, politicaComercial: { ativa: policy } };
}
function order(status = 'AGUARDANDO_PAGAMENTO', eventId = EVENT, method = 'PIX') {
  return { sucesso: true, autorizado: true, encontrado: true, consultaToken: TOKEN,
    pedido: { pedidoId: ORDER, eventoId: eventId, status, expiraEm: '2030-12-21T00:00:00.000Z' },
    pagamento: { forma: method, pix: method === 'PIX' ? { copiaECola: 'LOCAL-NOT-PAYABLE' } : null, invoiceUrl: method === 'CREDIT_CARD' ? 'https://example.invalid/local-card-payment' : '' },
    ingressoEmitido: status === 'CONCLUIDO',
    ingressos: status === 'CONCLUIDO' ? [{ codigo: 'CT-LOCAL', link: 'https://cariocaticket.com.br/ingresso/?codigo=CT-LOCAL&sig=LOCAL' }] : [] };
}
async function fixture(browser, route, options = {}) {
  const event = options.eventId || EVENT;
  const checkout = route.startsWith('/checkout'), v2 = route.includes('-v2');
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', permissions: [],
    viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  const page = await context.newPage();
  const s = { catalogs: 0, catalogArgs: [], next: 'B', holdCatalog: false, releases: [],
    payments: [], couponCalls: [], campaigns: 0, polls: 0, errors: [], holdCoupon: false,
    releaseCoupon: null, previews: [], feeReleases: [], releaseInitial: null, denyCatalog: false, holdPayment: false, releasePayment: null, missing: !!options.missing };
  page.on('pageerror', error => s.errors.push(error.message));
  await page.clock.install({ time: new Date('2030-01-01T00:00:00.000Z') });
  if (options.delayLeaseTimer) await context.addInitScript(() => {
    // Simulate browser timer clamping without replacing the product clock or
    // acceptance guards. RPC timeout (45s) and fee debounce remain unmodified.
    const schedule=window.setTimeout.bind(window), cancel=window.clearTimeout.bind(window);
    let id=-1000; const held=new Map(); window.__heldLeaseTimers=held;
    window.setTimeout=(fn,ms,...args)=>{
      if(ms>=4000&&ms<=6000){held.set(--id,{fn,args});return id;}
      return schedule(fn,ms,...args);
    };
    window.clearTimeout=timer=>{if(!held.delete(timer))cancel(timer);};
  });
  if (options.savedAttempt) await context.addInitScript(({event}) => {
    localStorage.setItem('CT_CHECKOUT_IDEMPOTENCY_' + event + '_PIX','CHK-LOCAL-SAVED');
  }, {event});
  if (options.recover) await context.addInitScript(({event,order,token}) => {
    localStorage.setItem('CT_CHECKOUT_RECOVERY_' + event, JSON.stringify({pedidoId:order,token}));
  }, { event: event, order: ORDER, token: TOKEN });
  if (options.grant) await context.addInitScript(({event,grant}) => {
    sessionStorage.setItem('CT_PRIVATE_GRANT_' + event, JSON.stringify({ grant, expiraEmEpoch: 4102444800 }));
  }, { event: event, grant: GRANT });
  const f = createFixtures();
  for (const method of ['ctEventoPublicoCarregarPROD', 'ctCheckoutPublicoCarregarEventoPROD']) {
    f.handlers['publicRpc:' + method] = async args => {
      assert.deepEqual(args, checkout && v2 ? [event, options.grant ? GRANT : ''] : [event]);
      s.catalogArgs.push(args); const number = ++s.catalogs;
      if (number === 1 && options.holdInitial) await new Promise(resolve => { s.releaseInitial = resolve; });
      if (number === 1 && options.initialFailure) return {sucesso:false,mensagem:'LOCAL_SYNTHETIC_CATALOG_FAILURE'};
      if (s.denyCatalog) return {sucesso:false,codigo:'EVENTO_PRIVADO_CONVITE',mensagem:'Acesse pelo convite individual.'};
      if (number > 1 && s.holdCatalog) await new Promise(resolve => s.releases.push(resolve));
      const result = catalog(number === 1 ? 'A' : s.next, number === 1 ? (options.ttl || 60000) : 3600000, event, !!options.policy);
      if (options.directions) result.evento.endereco='Rua de Teste, 123';
      if (s.missing) for (const key of ['temporalVersion', 'temporalEvaluatedAt', 'serverNow', 'nextTransitionAt', 'validUntil']) delete result[key];
      return result;
    };
  }
  f.handlers['publicRpc:ctCuponsPublicoValidarSeguroPROD'] = async args => {
    const p = args[0]; assert.equal(p.eventoId, event); s.couponCalls.push(p);
    if (s.holdCoupon) await new Promise(resolve => { s.releaseCoupon = resolve; });
    return { sucesso: true, valido: true, cupom: { codigo: p.codigo, campanhaId: 'LOCAL-CAMPAIGN' },
      calculo: { valorOriginalTotal: 25 * p.quantidade, valorFinalTotal: 15 * p.quantidade,
        descontoTotal: 10 * p.quantidade, precoOriginalUnitario: 25, precoFinalUnitario: 15 } };
  };
  f.handlers['publicRpc:ctCuponsPublicoRegistrarAcessoSeguroPROD'] = args => {
    assert.equal(args.length, 1); assert.equal(args[0].eventoId, event);
    assert.equal(args[0].codigo, 'LOCAL10'); assert.equal(args[0].sessaoId, 'LOCAL-SESSION');
    assert.equal(args[0].origem, 'LOCAL'); s.campaigns++;
    return { sucesso: true };
  };
  f.handlers['publicRpc:ctPoliticaComercialPreviewPublicoPROD'] = async args => {
    const p=args[0]; assert.equal(p.eventoId,event); s.previews.push(p);
    if(options.holdFee)await new Promise(resolve=>s.feeReleases.push(resolve));
    const subtotal=p.precoUnitario*p.quantidade, fee=subtotal*.1;
    return {sucesso:true,degradado:false,rolloutAtivo:true,revisao:'LOCAL-R1',
      resumo:{subtotalIngressos:subtotal,taxaCtPercentual:10,taxaCtTotal:fee,
      taxaComprador:fee,taxaProdutor:0,adicionaisComprador:0,totalComprador:subtotal+fee,pagadorTaxa:'COMPRADOR'}};
  };
  f.handlers['publicRpc:ctCheckoutPixPublicoIniciarPROD'] = async args => {
    assert.equal(args.length, 1); assert.equal(args[0].eventoId, event);
    assert(['A','B'].includes(args[0].loteId)); s.payments.push(args[0]);
    if (options.losePaymentResponse) await new Promise(()=>{}); // Deliberately lost synthetic response, no retry or real transport.
    if (s.holdPayment) await new Promise(resolve => { s.releasePayment = resolve; });
    return order(options.paymentStatus, event, options.method);
  };
  for (const method of ['ctCheckoutPixPublicoConsultarPROD','ctCheckoutPixPublicoStatusLocalPROD','ctCheckoutPixPublicoReconciliarPROD']) {
    f.handlers['publicRpc:' + method] = args => {
      assert.deepEqual(args, [ORDER, TOKEN]); s.polls++; return order(options.terminal && s.polls===1 ? options.terminal : options.complete ? 'CONCLUIDO' : undefined, event, options.method);
    };
  }
  const guard = await installIsolatedNetwork(context, { root: ROOT, origin: ORIGIN, ...f, auditMocks: true });
  if(options.traceClock) {
    // Observation only: execute the exact checked-in helper, then delegate every
    // call/return to it. The wrapper does not change time, leases or envelopes.
    const helperUrl=ORIGIN+'/assets/public-catalog-clock.js?v=20261012-temporal1';
    const observation=`
;(function(){
  const real=window.CTPublicCatalogClock, log=[];
  window.__temporalClockTrace=log;
  const record=entry=>log.push(Object.assign({at:performance.now()},entry));
  window.CTPublicCatalogClock=Object.freeze(Object.assign({},real,{create(options){
    const original=options||{}, forwarded=Object.assign({},original);
    forwarded.onExpire=function(reason){
      record({operation:'onExpire',reason});
      if(original.onExpire)return original.onExpire.apply(this,arguments);
    };
    const clock=real.create(forwarded), observed=Object.assign({},clock);
    observed.begin=function(){
      const result=clock.begin.apply(clock,arguments);
      record({operation:'begin',sequence:result&&result.sequence,startedAt:result&&result.startedAt});
      return result;
    };
    observed.accept=function(envelope,ticket){
      const result=clock.accept.apply(clock,arguments);
      record({operation:'accept',sequence:ticket&&ticket.sequence,result,
        envelope:{temporalVersion:envelope&&envelope.temporalVersion,
        temporalEvaluatedAt:envelope&&envelope.temporalEvaluatedAt,
        serverNow:envelope&&envelope.serverNow,nextTransitionAt:envelope&&envelope.nextTransitionAt,
        validUntil:envelope&&envelope.validUntil}});
      return result;
    };
    observed.invalidate=function(reason){
      const result=clock.invalidate.apply(clock,arguments);
      record({operation:'invalidate',reason});return result;
    };
    return Object.freeze(observed);
  }}));
}());
`;
    await mockRoute(context,{resources:[helperUrl]},route=>route.fulfill({
      contentType:'application/javascript',
      body:fs.readFileSync(path.join(ROOT,'assets/public-catalog-clock.js'),'utf8')+observation
    }));
  }
  if(options.recoveryFailure) {
    let rejected=false;
    await mockRoute(context, {rpc:{publicRpc:['ctCheckoutPixPublicoConsultarPROD']}}, async route=>{
      if(rejected)return route.fallback();
      const fields=new URLSearchParams(route.request().postData()||'');
      assert.deepEqual(JSON.parse(fields.get('argsJson')),[ORDER,TOKEN]);
      rejected=true;
      const response={ctMinhaCariocaPost:true,id:fields.get('ctMinhaCariocaRequestId'),ok:false,erro:'LOCAL_SYNTHETIC_RECOVERY_FAILURE'};
      return route.fulfill({contentType:'text/html',body:'<!doctype html><script>top.postMessage('+JSON.stringify(response)+',"*")</script>'});
    });
  }
  const query = '?evento=' + event + (options.campaign ? '&cupom=LOCAL10&src=LOCAL&csid=LOCAL-SESSION' : '');
  await page.goto(ORIGIN + route + query, { waitUntil: 'domcontentloaded' });
  if (options.savedAttempt) await page.locator('#catalogRecoveryAction').waitFor({state:'visible'});
  else await until(() => s.catalogs === 1, 'initial catalog request');
  if (!options.missing && !options.recover && !options.holdInitial && !options.savedAttempt && !options.initialFailure) {
    if (checkout) await page.locator('#typeSelect option[value="TYPE"]').waitFor({state:'attached'});
    else await page.locator('#app').waitFor({state:'visible'});
  }
  return { page, s,
    async fill() {
      await page.locator('#typeSelect').selectOption('TYPE'); await page.locator('#lotSelect').selectOption('A');
      await page.locator('#buyerName').fill('Comprador Sintético'); await page.locator('#buyerCpf').fill('00000000000');
      await page.locator('#buyerWhatsapp').fill('81999999999'); await page.locator('#quantity').fill('2');
      if(options.method==='CREDIT_CARD')await page.locator('#paymentCard').check();
      await page.locator('#participants [data-name]').fill('Participante Preservado');
      await page.locator('#participants [data-phone]').fill('81988888888');
    },
    async advance() { await page.clock.fastForward((options.ttl || 60000) + 100); await page.clock.runFor(100); },
    releaseCatalog() { s.holdCatalog = false; s.releases.splice(0).forEach(resolve => resolve()); },
    async close(name) {
      s.releases.splice(0).forEach(resolve => resolve()); s.releaseCoupon?.(); s.releasePayment?.(); s.releaseInitial?.(); s.feeReleases.splice(0).forEach(resolve=>resolve());
      guard.beginClose();
      await context.close(); guard.assertClean(); assert.deepEqual(s.errors, []);
      report.push({ name, status:'PASS', forwarded:guard.state.forwarded, catalogs:s.catalogs,
        payments:s.payments.length, campaigns:s.campaigns, rpc:guard.state.rpc.map(x=>x.method) });
      console.log('PASS ' + name);
    }
  };
}
async function retainedForm(f) {
  assert.equal(await f.page.locator('#buyerName').inputValue(), 'Comprador Sintético');
  assert.equal(await f.page.locator('#buyerWhatsapp').inputValue(), '81999999999');
  assert.equal(await f.page.locator('#quantity').inputValue(), '2');
  assert.equal(await f.page.locator('#participants [data-name]').inputValue(), 'Participante Preservado');
  assert.equal(await f.page.locator('#participants [data-phone]').inputValue(), '81988888888');
}
(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  const browser = await chromium.launch({headless:true, proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'}});
  try {
    for (const route of ['/checkout/','/checkout-v2/']) {
      const f = await fixture(browser, route); await f.fill(); f.s.holdCatalog = true;
      await f.advance(); await until(()=>f.s.catalogs===2,'deadline requests fresh catalog');
      assert.equal(await f.page.locator('#payButton').isDisabled(), true);
      assert.equal(await f.page.locator('#typeSelect').isDisabled(), true);
      assert.equal(await f.page.locator('#lotSelect').isDisabled(), true);
      await f.page.locator('#payButton').evaluate(el=>el.click());
      assert.equal(f.s.payments.length,0,'expired lot never initiates payment');
      await retainedForm(f);
      f.releaseCatalog(); await until(async()=>!(await f.page.locator('#typeSelect').isDisabled()),'fresh catalog unlocks selection');
      assert.equal(await f.page.locator('#lotSelect').inputValue(),'','no silent migration to new price/lot');
      assert.equal(await f.page.locator('#lotSelect option[value="A"]').count(),0);
      await retainedForm(f);
      await f.page.locator('#typeSelect').selectOption('TYPE'); await f.page.locator('#lotSelect').selectOption('B');
      await retainedForm(f); await f.page.locator('#payButton').click();
      await until(()=>f.s.payments.length===1,'new lot purchase mock');
      assert.equal(f.s.payments[0].loteId,'B');
      await f.close(route+' deadline, exact lot and participant preservation');

      const resume = await fixture(browser,route); await resume.fill(); resume.s.holdCatalog=true;
      await resume.page.evaluate(()=>{
        dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})); dispatchEvent(new Event('focus'));
        dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange'));
      });
      await until(()=>resume.s.catalogs===2,'resume refresh');
      assert.equal(await resume.page.locator('#payButton').isDisabled(),true);
      await delay(150); assert.equal(resume.s.catalogs,2,'resume events share one request');
      resume.releaseCatalog(); await until(async()=>!(await resume.page.locator('#typeSelect').isDisabled()),'resume response');
      await retainedForm(resume); await resume.close(route+' resume deduplication');

      const hidden=await fixture(browser,route); await hidden.fill();
      await hidden.page.evaluate(()=>{
        window.__fixtureHidden=true;
        Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__fixtureHidden?'hidden':'visible'});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await hidden.advance(); await delay(100);
      assert.equal(hidden.s.catalogs,1,'hidden tab does not start repeated availability requests');
      assert.equal(await hidden.page.locator('#payButton').isDisabled(),true,'hidden expiry still invalidates the old offer');
      await hidden.page.evaluate(()=>{window.__fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
      await until(()=>hidden.s.catalogs===2,'visible tab resumes fresh availability');
      await until(async()=>!(await hidden.page.locator('#typeSelect').isDisabled()),'visible availability response');
      await retainedForm(hidden); await hidden.close(route+' hidden deadline and visibility resume');

      const coupon = await fixture(browser,route,{ttl:5000}); await coupon.fill(); coupon.s.holdCoupon=true;
      await coupon.page.locator('#couponToggle').click(); await coupon.page.locator('#couponCode').fill('LOCAL10');
      await coupon.page.locator('#couponApply').click(); await until(()=>coupon.s.releaseCoupon,'coupon pending');
      await coupon.advance(); await until(()=>coupon.s.catalogs===2,'catalog replaces pending coupon selection');
      await until(async()=>!(await coupon.page.locator('#typeSelect').isDisabled()),'replacement catalog');
      coupon.s.releaseCoupon(); await delay(150);
      assert.equal(await coupon.page.locator('#promoSummary').isVisible(),false,'late coupon cannot resurrect old price');
      assert.equal(coupon.s.payments.length,0); await retainedForm(coupon);
      await coupon.close(route+' rejects stale coupon reply');

      const pending = await fixture(browser,route,{ttl:5000}); await pending.fill(); pending.s.holdPayment=true;
      await pending.page.locator('#payButton').click(); await until(()=>pending.s.payments.length===1,'payment creation in flight');
      const key=pending.s.payments[0].idempotenciaChave; assert(key);
      await pending.advance();
      assert.equal(pending.s.catalogs,1,'in-flight creation is not replaced by catalog refresh');
      assert.equal(pending.s.payments.length,1);
      pending.s.releasePayment(); await pending.page.locator('#pixPanel').waitFor({state:'visible'});
      await pending.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))); await delay(150);
      assert.equal(pending.s.catalogs,1); assert.equal(pending.s.payments.length,1);
      assert.equal(await pending.page.locator('#closedPanel').isVisible(),false);
      await pending.close(route+' creation and pending order survive deadline');

      const recovery = await fixture(browser,route,{recover:true,missing:true});
      await recovery.page.locator('#pixPanel').waitFor({state:'visible'});
      await recovery.advance(); await recovery.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await delay(150); assert.equal(recovery.s.payments.length,0); assert.equal(recovery.s.catalogs,1);
      assert(recovery.s.polls>=1); assert.equal(await recovery.page.locator('#pixPanel').isVisible(),true);
      await recovery.close(route+' existing order recovery survives deadline');

      const empty = await fixture(browser,route); await empty.fill(); empty.s.next='NONE';
      await empty.advance(); await until(()=>empty.s.catalogs===2,'last lot ends');
      await until(async()=>(await empty.page.locator('#catalogTemporalNotice').textContent()).includes('Não há ingressos'),'no online lots notice');
      assert.equal(await empty.page.locator('#buyerPanel').isVisible(),true);
      assert.equal(await empty.page.locator('#closedPanel').isVisible(),false);
      await retainedForm(empty); await empty.page.locator('#payButton').evaluate(el=>el.click());
      assert.equal(empty.s.payments.length,0);
      await empty.close(route+' no online lots preserves event form and does not sell');

      const missing = await fixture(browser,route,{missing:true});
      await missing.page.locator('#catalogTemporalRetry').waitFor({state:'visible'});
      assert.equal(await missing.page.locator('#payButton').isDisabled(),true);
      missing.s.missing=false; await missing.page.locator('#catalogTemporalRetry').click();
      await until(()=>missing.s.catalogs===2,'explicit retry after invalid envelope');
      await missing.page.locator('#typeSelect option[value="TYPE"]').waitFor({state:'attached'});
      assert.equal(missing.s.payments.length,0);
      assert.equal(await missing.page.locator('#eventName').textContent(),'Evento temporal sintético');
      assert.match(await missing.page.locator('#buyerEmailLabel').textContent(),/opcional/);
      await missing.close(route+' missing envelope fails closed and retry initializes full metadata');

      const initial=await fixture(browser,route,{holdInitial:true});
      await initial.page.evaluate(()=>dispatchEvent(new Event('focus')));
      initial.s.releaseInitial();
      await until(()=>initial.s.catalogs===2,'resume invalidates initial pending response');
      await initial.page.locator('#typeSelect option[value="TYPE"]').waitFor({state:'attached'});
      assert.equal(await initial.page.locator('#eventName').textContent(),'Evento temporal sintético');
      assert.match(await initial.page.locator('#buyerEmailLabel').textContent(),/opcional/);
      assert.equal(initial.s.payments.length,0);
      await initial.close(route+' first in-flight response cannot bypass resume invalidation');

      const saved=await fixture(browser,route,{savedAttempt:true});
      await saved.page.locator('#catalogRecoveryAction').waitFor({state:'visible'});
      await saved.page.evaluate(()=>{
        const p=document.getElementById('paymentCard');p.checked=true;p.dispatchEvent(new Event('change',{bubbles:true}));
        const q=document.getElementById('quantity');q.value='3';q.dispatchEvent(new Event('input',{bubbles:true}));
        document.getElementById('payButton').click();
      });
      await saved.page.clock.runFor(300); await delay(100);
      assert.equal(saved.s.payments.length,0,'unknown prior result cannot authorize a new payment with another method');
      assert.equal(await saved.page.evaluate(event=>localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_'+event+'_PIX'),EVENT),'CHK-LOCAL-SAVED');
      assert.equal(await saved.page.evaluate(event=>localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_'+event+'_CREDIT_CARD'),EVENT),null,'no replacement key is minted');
      const recoveryUrl=new URL(await saved.page.locator('#catalogRecoveryAction').getAttribute('href'),ORIGIN);
      assert.equal(recoveryUrl.pathname,'/minha-carioca/conta/');
      assert.equal(recoveryUrl.search,'');assert.equal(recoveryUrl.hash,'');
      await saved.close(route+' stored attempt blocks cross-method creation and offers explicit private recovery');

      const lost=await fixture(browser,route,{ttl:5000,losePaymentResponse:true});await lost.fill();
      await lost.page.locator('#payButton').click();await until(()=>lost.s.payments.length===1,'synthetic request sent once');
      const lostKey=lost.s.payments[0].idempotenciaChave;assert(lostKey);
      await lost.page.clock.fastForward(route==='/checkout-v2/'?121000:46000);await lost.page.clock.runFor(200);
      await lost.page.locator('#catalogRecoveryAction').waitFor({state:'visible'});
      await retainedForm(lost);
      await lost.page.evaluate(()=>{
        const p=document.getElementById('paymentCard');p.checked=true;p.dispatchEvent(new Event('change',{bubbles:true}));
        document.getElementById('payButton').click();
      });
      await delay(100);assert.equal(lost.s.payments.length,1,'lost response is not permission for another charge');
      assert.equal(await lost.page.evaluate(event=>localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_'+event+'_PIX'),EVENT),lostKey);
      await lost.page.reload({waitUntil:'domcontentloaded'});
      await lost.page.locator('#catalogRecoveryAction').waitFor({state:'visible'});
      await lost.page.locator('#payButton').evaluate(el=>el.click());await delay(100);
      assert.equal(lost.s.payments.length,1,'reload cannot forget the unresolved payment');
      assert.equal(await lost.page.evaluate(event=>localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_'+event+'_PIX'),EVENT),lostKey);
      assert.equal(await lost.page.evaluate(event=>localStorage.getItem('CT_CHECKOUT_IDEMPOTENCY_'+event+'_CREDIT_CARD'),EVENT),null);
      await lost.close(route+' lost response, expired lot and reload never create a second payment');

      const fees=await fixture(browser,route,{eventId:'EVT-23112026-ERA-BEAUTY-EAC4B673',policy:true,traceClock:true});
      await fees.fill(); await until(()=>fees.s.previews.length>=1,'initial price preview'); fees.s.holdCatalog=true;
      await fees.advance(); await until(()=>fees.s.catalogs===2,'price preview lease expires');
      const quoteCount=fees.s.previews.length;
      await fees.page.evaluate(legacy=>{
        const q=document.getElementById('quantity');q.value='3';q.dispatchEvent(new Event('input',{bubbles:true}));
        const p=document.getElementById('paymentCard');p.checked=true;p.dispatchEvent(new Event('change',{bubbles:true}));
        if(legacy)document.getElementById('feeRetry').click();
      },route==='/checkout/');
      await fees.page.clock.runFor(500); await delay(100);
      assert.equal(fees.s.previews.length,quoteCount,'stale quantity, payment and retry cannot quote expired lot');
      assert.equal(fees.s.payments.length,0);
      fees.releaseCatalog();
      try { await until(async()=>!(await fees.page.locator('#typeSelect').isDisabled()),'price catalog recovers'); }
      catch(error){
        console.error('SYNTHETIC_PRICE_RECOVERY_DIAGNOSTIC',JSON.stringify({
          route,catalogs:fees.s.catalogs,errors:fees.s.errors,previews:fees.s.previews.length,payments:fees.s.payments.length,
          clock:await fees.page.evaluate(()=>window.__temporalClockTrace||[]),
          ui:await fees.page.evaluate(()=>Object.fromEntries(['catalogTemporalNotice','typeSelect','lotSelect','payButton','feeSummary'].map(id=>{
            const el=document.getElementById(id);return[id,el?{text:el.textContent,disabled:!!el.disabled,hidden:el.hidden,className:el.className}:null];
          })))
        }));
        throw error;
      }
      await fees.close(route+' all quote entry points respect stale catalog');

      const delayed=await fixture(browser,route,{eventId:'EVT-23112026-ERA-BEAUTY-EAC4B673',policy:true,holdFee:true,delayLeaseTimer:true,ttl:5000});
      await delayed.fill(); await until(()=>delayed.s.feeReleases.length>=1,'fee response held');
      assert(await delayed.page.evaluate(()=>window.__heldLeaseTimers.size>=1),'actual lease expiration timer is delayed');
      delayed.s.holdCatalog=true;
      await delayed.page.clock.fastForward(5100);
      delayed.s.feeReleases.splice(0).forEach(resolve=>resolve());
      await until(()=>delayed.s.catalogs===2,'late fee callback detects expiry even before delayed timer');
      assert.equal(await delayed.page.locator('#payButton').isDisabled(),true);
      assert.equal(await delayed.page.locator('#feeSummary').isVisible(),false,'late fee cannot apply to expired lot');
      assert.equal(delayed.s.payments.length,0);
      delayed.releaseCatalog(); await until(async()=>!(await delayed.page.locator('#typeSelect').isDisabled()),'late fee recovery');
      await delayed.close(route+' late fee rejects expired lease with delayed timer');

      const direct=await fixture(browser,route,{delayLeaseTimer:true,ttl:5000}); await direct.fill();
      assert.equal(await direct.page.locator('#payButton').isDisabled(),false);
      assert(await direct.page.evaluate(()=>window.__heldLeaseTimers.size>=1));
      await direct.page.clock.fastForward(5100);
      assert.equal(await direct.page.locator('#payButton').isDisabled(),false,'expiry timer has not disabled the button');
      await direct.page.locator('#payButton').click();
      await until(()=>direct.s.catalogs===2,'payment handler itself notices stale lease');
      assert.equal(direct.s.payments.length,0,'synchronous payment guard stops stale enabled button');
      await retainedForm(direct); await direct.close(route+' payment guard works when timer is delayed');

      const card=await fixture(browser,route,{method:'CREDIT_CARD'}); await card.fill();
      await card.page.locator('#payButton').click(); await card.page.locator('#cardPanel').waitFor({state:'visible'});
      const invoice=await card.page.locator('#cardPaymentLink').getAttribute('href');
      await card.advance(); await card.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await delay(100); assert.equal(card.s.payments.length,1); assert.equal(card.s.catalogs,1);
      assert.equal(await card.page.locator('#cardPaymentLink').getAttribute('href'),invoice);
      await card.close(route+' existing card order survives deadline without a second purchase');

      const success=await fixture(browser,route,{recover:true,complete:true});
      await success.page.locator('#successPanel').waitFor({state:'visible'});
      await success.advance(); await success.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await delay(100); assert.equal(success.s.catalogs,1); assert.equal(success.s.payments.length,0);
      assert.equal(await success.page.locator('#successPanel').isVisible(),true);
      await success.close(route+' issued ticket success is preserved after expiry');

      const terminal=await fixture(browser,route,{recover:true,terminal:'EXPIRADO'});
      await until(()=>terminal.s.catalogs===2,'terminal order reloads current availability');
      await terminal.page.locator('#typeSelect option[value="TYPE"]').waitFor({state:'attached'});
      await terminal.page.locator('#loading').waitFor({state:'hidden'});
      await terminal.page.locator('#modalOk').click();
      await terminal.page.locator('#typeSelect').selectOption('TYPE'); await terminal.page.locator('#lotSelect').selectOption('B');
      assert.equal(await terminal.page.locator('#lotSelect option[value="A"]').count(),0);
      assert.equal(terminal.s.payments.length,0);
      await terminal.close(route+' terminal order reentry uses current lot and no automatic purchase');

      const recoverFailure=await fixture(browser,route,{recover:true,recoveryFailure:true});
      await recoverFailure.page.locator('#catalogTemporalRetry').waitFor({state:'visible'});
      await recoverFailure.page.locator('#catalogTemporalRetry').click();
      await recoverFailure.page.locator('#pixPanel').waitFor({state:'visible'});
      assert.equal(recoverFailure.s.payments.length,0,'recovery retry never creates a replacement order');
      await recoverFailure.close(route+' initial recovery RPC failure has an explicit safe retry');
    }
    const privateFlow=await fixture(browser,'/checkout-v2/',{grant:true,campaign:true});
    await until(()=>privateFlow.s.campaigns===1,'campaign access registered once');
    await privateFlow.fill(); await privateFlow.advance(); await until(()=>privateFlow.s.catalogs===2,'private refresh');
    assert(privateFlow.s.catalogArgs.every(args=>args[1]===GRANT),'grant is unchanged on every read');
    assert.equal(privateFlow.s.campaigns,1,'refresh must not count a second campaign visit');
    assert.equal(await privateFlow.page.evaluate(()=>new URL(location.href).searchParams.get('csid')),'LOCAL-SESSION');
    assert.equal(await privateFlow.page.evaluate(()=>JSON.parse(sessionStorage.getItem('CT_PRIVATE_GRANT_EVT-LOCAL-TEMPORAL')).grant),GRANT);
    await retainedForm(privateFlow); await privateFlow.close('private grant and campaign survive catalog transition');

    for (const route of ['/evento/','/evento-v2/']) {
      const gated=await fixture(browser,route,{directions:true,campaign:route.includes('-v2')});
      const map=gated.page.locator('#directions-map-preview');
      await map.waitFor({state:'visible'});
      const address=await gated.page.locator('#directions-address').inputValue();
      const share=await gated.page.locator('#shareWhatsAppAction').getAttribute('href');
      assert(share&&share.includes('wa.me'),'initial public share is configured');
      const visits=route.includes('-v2')?1:0;
      if(visits)await until(()=>gated.s.campaigns===visits,'initial campaign visit');
      gated.s.denyCatalog=true;
      await gated.page.evaluate(()=>dispatchEvent(new Event('focus')));
      await until(()=>gated.s.catalogs===2,'loaded event is denied on refresh');
      await gated.page.locator('#errorBox').waitFor({state:'visible'});
      assert.equal(await gated.page.locator('#app').isVisible(),false);
      assert.equal(await gated.page.locator('#retryEventLoad').isVisible(),false);
      assert.equal(await gated.page.locator('#shareWhatsAppAction').getAttribute('href'),null);
      await gated.page.evaluate(()=>CTPublicI18n.setLocale('en-US'));
      assert.equal(await gated.page.locator('#app').isVisible(),false,'language change cannot reopen an authoritatively denied event');
      assert.equal(await gated.page.locator('#errorBox').isVisible(),true);
      assert.equal(await gated.page.locator('#shareWhatsAppAction').getAttribute('href'),null);
      await gated.page.evaluate(()=>CTPublicI18n.setLocale('pt-BR'));
      assert.equal(await gated.page.locator('#app').isVisible(),false);
      gated.s.denyCatalog=false;
      await gated.page.evaluate(()=>dispatchEvent(new Event('focus')));
      await until(()=>gated.s.catalogs===3,'event permitted on later resume');
      await gated.page.locator('#app').waitFor({state:'visible'});
      assert.equal(await gated.page.locator('#errorBox').isVisible(),false);
      assert.equal(await gated.page.locator('#retryEventLoad').isVisible(),false);
      assert.equal(await gated.page.locator('#errorReference').isVisible(),false);
      assert.equal(await map.isVisible(),true);
      assert.equal(await gated.page.locator('#directions-address').inputValue(),address);
      assert.equal(await gated.page.locator('#shareWhatsAppAction').getAttribute('href'),share);
      assert.equal(gated.s.campaigns,visits,'gate recovery is not a second campaign visit');
      assert.equal(gated.s.payments.length,0);
      await gated.close(route+' loaded event gate denial and later permission restore view, directions and share');

      const failed=await fixture(browser,route,{initialFailure:true});
      await failed.page.locator('#errorBox').waitFor({state:'visible'});
      await failed.page.evaluate(()=>dispatchEvent(new Event('focus')));
      await until(()=>failed.s.catalogs===2,'event resume retries failed initial load');
      await failed.page.locator('#app').waitFor({state:'visible'});
      assert.equal(await failed.page.locator('#errorBox').isVisible(),false);
      assert.equal(await failed.page.locator('#retryEventLoad').isVisible(),false);
      assert.equal(await failed.page.locator('#errorReference').isVisible(),false);
      await failed.close(route+' initial failure then focus clears obsolete error UI');

      const initial=await fixture(browser,route,{holdInitial:true});
      await initial.page.evaluate(()=>dispatchEvent(new Event('focus')));initial.s.releaseInitial();
      await until(()=>initial.s.catalogs===2,'event first in-flight response rejected after focus');
      await initial.page.locator('#app').waitFor({state:'visible'});
      assert.equal(await initial.page.locator('#errorBox').isVisible(),false);
      assert((await initial.page.locator('#tickets').textContent()).includes('Lote B'));
      await initial.close(route+' focus during first request recovers a complete event view');

      const direct=await fixture(browser,route,{delayLeaseTimer:true,ttl:5000});
      assert(await direct.page.evaluate(()=>window.__heldLeaseTimers.size>=1));
      const url=direct.page.url();
      await direct.page.clock.fastForward(5100);
      assert((await direct.page.locator('#buyHero').getAttribute('href')).includes('checkout'),'expiry timer has not removed CTA');
      await direct.page.locator('#buyHero').click();
      await until(()=>direct.s.catalogs===2,'CTA handler notices stale lease');
      assert.equal(direct.page.url(),url,'expired CTA cannot navigate before refresh');
      assert.equal(direct.s.payments.length,0);
      await direct.close(route+' synchronous CTA guard works when timer is delayed');

      const f=await fixture(browser,route,{mobile:true,campaign:route.includes('-v2')});
      const beforeTitle=await f.page.locator('h1').first().textContent();
      f.s.holdCatalog=true; await f.advance(); await until(()=>f.s.catalogs===2,'event deadline refresh');
      const active=await f.page.locator('#buyHero').getAttribute('href');
      assert(!active || active==='#','expired event offer has no active checkout URL');
      assert.equal(await f.page.locator('#app').isVisible(),true);
      assert.equal(await f.page.locator('h1').first().textContent(),beforeTitle);
      f.releaseCatalog(); await until(async()=>(await f.page.locator('#tickets').textContent()).includes('Lote B'),'fresh event lots');
      assert((await f.page.locator('#buyHero').getAttribute('href')).includes('checkout'));
      assert.equal(f.s.campaigns,route.includes('-v2')?1:0);
      f.s.next='NONE'; await f.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await until(()=>f.s.catalogs===3,'no-lot response'); await delay(150);
      assert.equal(await f.page.locator('#app').isVisible(),true);
      assert.equal(await f.page.locator('h1').first().textContent(),beforeTitle);
      const closed=await f.page.locator('#buyHero').getAttribute('href');
      assert(!closed||closed==='#','no current lot cannot expose a buy URL');
      assert.equal(f.s.payments.length,0); await f.close(route+' offer refresh preserves event and campaign');
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(report,null,2));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
