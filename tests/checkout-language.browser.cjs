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
        const files = { '/assets/public-i18n.js':'assets/public-i18n.js','/assets/checkout-translations.js':'assets/checkout-translations.js','/assets/checkout-language.js':'assets/checkout-language.js','/assets/checkout-language.css':'assets/checkout-language.css', '/checkout/': 'checkout/index.html', '/checkout-v2/': 'checkout-v2/index.html',
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
  if(options.locale)await context.addInitScript(locale=>{if(window===window.top)localStorage.setItem('ct-home-locale',locale);},options.locale);
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

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const results=[];
 const evidence=process.env.CT_EVIDENCE_DIR||'test-results/checkout-language';fs.mkdirSync(evidence,{recursive:true});
 try{
  for(const routePath of ['/checkout/','/checkout-v2/'])for(const locale of ['pt-BR','en-US','es','zh-Hans'])for(const width of [320,390,1440]){
   const name=routePath.replaceAll('/','')+'-'+locale+'-'+width;let f;
   try{
    const options={locale,clock:true,method:width===390?'CREDIT_CARD':'PIX'};
    f=await fixture(browser,routePath,width<1000,options);await f.page.setViewportSize({width,height:900});
    await f.page.clock.pauseAt(new Date());await f.fill();
    const values=await f.page.locator('#buyerPanel input').evaluateAll(nodes=>nodes.map(n=>[n.id,n.value,n.checked]));
    const calls=[f.state.consults,f.state.polls,f.state.payments.length];
    for(const target of ['en-US','zh-Hans',locale])await f.page.locator('#checkoutLanguage').selectOption(target);
    assert.deepEqual(await f.page.locator('#buyerPanel input').evaluateAll(nodes=>nodes.map(n=>[n.id,n.value,n.checked])),values);
    assert.deepEqual([f.state.consults,f.state.polls,f.state.payments.length],calls);
    assert.equal(await f.page.locator('#checkoutLanguage').inputValue(),locale);
    await f.page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});
    assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'normal horizontal overflow');
    await f.page.evaluate(()=>Array.from(document.querySelectorAll('body *')).map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]).forEach(([n,size])=>{n.dataset.previousSize=n.style.fontSize;n.style.fontSize=(size*1.5)+'px';}));
    await f.page.screenshot({path:path.join(evidence,name+'-font150.png'),fullPage:true});
    assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'150% horizontal overflow');
    await f.page.evaluate(()=>document.querySelectorAll('[data-previous-size]').forEach(n=>{n.style.fontSize=n.dataset.previousSize;delete n.dataset.previousSize;}));
    for(let i=0;i<2;i++){await f.open();await f.page.keyboard.press('Escape');await f.page.locator('#checkoutLeaveDialog').waitFor({state:'hidden'});assert(await f.page.locator('#checkoutHome').evaluate(e=>document.activeElement===e));}
    await f.page.locator('#payButton').click();await until(()=>f.state.payments.length===1,'one synthetic payment');
    const submitted=JSON.stringify(f.state.payments);const polls=f.state.polls;
    for(const target of ['es','pt-BR',locale])await f.page.locator('#checkoutLanguage').selectOption(target);
    assert.equal(JSON.stringify(f.state.payments),submitted);assert.equal(f.state.polls,polls);
    await f.page.clock.runFor(16000);assert(f.state.polls>polls,'pending polling still active');assert.equal(f.state.payments.length,1);
    await f.finish();f=null;results.push({name,passed:true});
   }catch(error){results.push({name,passed:false,error:error.stack});if(f){await f.page.screenshot({path:path.join(evidence,name+'-failure.png'),fullPage:true}).catch(()=>{});await f.context.close();}}
  }
 }finally{await browser.close();fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify(results,null,2));if(results.some(r=>!r.passed))process.exitCode=1;
})();
