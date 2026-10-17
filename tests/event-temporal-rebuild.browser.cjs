'use strict';
// Actual event HTML/assets and real iframe postMessage transport, synthetic RPC
// responses only. All network requests are fulfilled locally or aborted.
// Run: node --test tests/event-temporal-rebuild.browser.cjs
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),host='https://cariocaticket.com.br';
const EPOCH=Date.parse('2030-01-01T00:00:00Z'),iso=n=>new Date(EPOCH+n).toISOString();
const purchases=['buyHero','buySide','buyMobile','buyClosing'];
let browser;
before(async()=>{
  const supplied=process.env.CHROMIUM_EXECUTABLE_PATH;
  const executablePath=supplied||(fs.existsSync(chromium.executablePath())?undefined:fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'}});
});
after(async()=>{if(browser)await browser.close();});
function catalog({now=0,ttl=30000,end=3600000,purchasable=true,projection=true}={}){
  const result={sucesso:true,temporalVersion:1,serverNow:iso(now),temporalEvaluatedAt:iso(now),nextTransitionAt:null,validUntil:iso(now+ttl),evento:{id:'EVT-TEMPORAL-FIXTURE',nome:'Evento sintético',data:'01/01/2030',dataFim:'31/12/1999',temporal:{state:'TEMPORAL_V1',temporalVersion:1,inicioEm:iso(-3600000),fimEm:iso(end),fusoHorario:'America/Recife'}},visual:{descricaoCurta:'Fixture offline'},menorPreco:'R$ 20,00',tipos:purchasable?[{id:'T1',nome:'Individual',lotes:[{id:'L2',nome:'Atual',preco:'R$ 20,00',precoNumero:20}]}]:[]};
  if(projection)result.lotesVenda={versao:1,avaliadoEm:iso(now),tipos:[{tipoId:'T1',tipoNome:'Individual',loteAtualId:'L2',lotes:[
    {id:'L1',nome:'Anterior <script>window.bad=1</script>',statusVenda:'ENCERRADO',disponivelParaCompra:false,quantidadeLimitada:true,disponiveis:0,preco:'R$ 10,00'},
    {id:'L2',nome:'Atual',statusVenda:'ATUAL',disponivelParaCompra:purchasable,motivoIndisponibilidade:purchasable?'':'RESERVAS_PENDENTES',quantidadeLimitada:true,disponiveis:purchasable?12:0,antecipado:true,preco:'R$ 20,00'},
    {id:'L3',nome:'Futuro',statusVenda:'EM_BREVE',disponivelParaCompra:false,quantidadeLimitada:false,disponiveis:null,preco:'R$ 30,00'},
    {id:'L4',nome:'Pausado',statusVenda:'PAUSADO',disponivelParaCompra:false,quantidadeLimitada:false,disponiveis:null,preco:'R$ 40,00'}]}]};
  return result;
}
async function isolated(routeName,run){
  const context=await browser.newContext({offline:true,serviceWorkers:'block',acceptDownloads:false,permissions:[],viewport:{width:390,height:844}});
  const html=fs.readFileSync(path.join(root,routeName,'index.html'),'utf8');
  const endpoint=html.match(/var APP='([^']+)'/)[1];
  const url=host+'/'+routeName+'/?evento=EVT-TEMPORAL-FIXTURE';
  const pending=[],unexpected=[],errors=[];
  const optionalMissing=new Set(['/pwa-register.js','/manifest.webmanifest','/assets/carioca-ticket-icon-192.png','/favicon.ico']);
  await context.addInitScript(()=>localStorage.setItem('ct-public-privacy-v1',JSON.stringify({version:1,analytics:false,maps:false})));
  await context.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url());
    if(request.method()==='GET'&&request.url()===url)return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
    if(request.method()==='GET'&&u.origin===host){
      const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
      if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){
        const contentType={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
        return route.fulfill({contentType,body:fs.readFileSync(file)});
      }
      if(optionalMissing.has(u.pathname))return route.abort('blockedbyclient');
    }
    if(request.method()==='POST'&&request.url()===endpoint){
      const fields=new URLSearchParams(request.postData()||'');
      const valid=fields.get('ctMinhaCariocaAction')==='publicRpc'&&fields.get('metodo')==='ctEventoPublicoCarregarPROD'&&fields.get('argsJson')==='["EVT-TEMPORAL-FIXTURE"]'&&fields.get('ctMinhaCariocaRequestId');
      if(valid){pending.push({route,id:fields.get('ctMinhaCariocaRequestId')});return;}
    }
    unexpected.push({method:request.method(),host:u.hostname,path:u.pathname});
    await route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*',socket=>{unexpected.push({websocket:true});socket.close();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date(EPOCH)});await page.clock.pauseAt(new Date(EPOCH+60000));
  const waitReads=async n=>{const limit=Date.now()+5000;while(pending.length<n&&Date.now()<limit)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(pending.length,n);};
  const reply=async(n,result)=>{
    const p=pending[n];assert(p,'expected pending read');
    const payload=JSON.stringify({ctMinhaCariocaPost:true,id:p.id,ok:true,resultado:result}).replace(/</g,'\\u003c');
    await p.route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><script>top.postMessage('+payload+','+JSON.stringify(host)+')</script>'});
  };
  const blocked=async()=>{for(const id of purchases){assert.equal(await page.locator('#'+id).getAttribute('href'),null);assert.equal(await page.locator('#'+id).getAttribute('aria-disabled'),'true');}};
  const allowed=async()=>{for(const id of purchases){assert.match(await page.locator('#'+id).getAttribute('href'),/checkout/);assert.equal(await page.locator('#'+id).getAttribute('aria-disabled'),null);}};
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});await waitReads(1);
    await run({page,pending,reply,waitReads,blocked,allowed});
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[],'no undeclared request, mutation, or live network forwarding');
  }finally{await context.close();}
}
for(const route of ['evento','evento-v2']){
  test(route+': all projected states, safe producer text and translated labels',()=>isolated(route,async({page,reply,allowed})=>{
    await reply(0,catalog());await page.locator('#app').waitFor({state:'visible'});await allowed();
    assert.equal(await page.locator('.ct-lot-row').count(),4);assert.equal(await page.evaluate(()=>window.bad),undefined);
    assert((await page.locator('#tickets').textContent()).includes('<script>window.bad=1</script>'));
    await page.locator('#event-language').selectOption('en-US');
    const text=await page.locator('#tickets').textContent();for(const label of ['Closed','Current lot','Coming soon','Paused','Opened early'])assert(text.includes(label));
  }));
  test(route+': expiry blocks immediately and revalidates once without advance',()=>isolated(route,async({page,reply,waitReads,blocked,allowed,pending})=>{
    await reply(0,catalog({ttl:1000}));await page.locator('#app').waitFor({state:'visible'});await allowed();
    await page.clock.runFor(1000);await waitReads(2);await blocked();
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(pending.length,2);assert.equal(await page.locator('[data-lot-state="ATUAL"]').count(),0);
    await reply(1,catalog({now:1000}));await page.waitForFunction(()=>!document.getElementById('buyHero').hasAttribute('aria-disabled'));await allowed();
  }));
  test(route+': reservations block purchase and future lot stays unavailable',()=>isolated(route,async({page,reply,blocked})=>{
    await reply(0,catalog({purchasable:false}));await page.locator('#app').waitFor({state:'visible'});await blocked();
    assert.match(await page.locator('#tickets').textContent(),/Aguardando liberação de reservas/);
    assert.equal(await page.locator('[data-lot-state="EM_BREVE"]').count(),1);
  }));
  test(route+': canonical end hides purchase controls and survives ended gate',()=>isolated(route,async({page,reply,waitReads,blocked})=>{
    await reply(0,catalog({end:1000}));await page.locator('#app').waitFor({state:'visible'});await page.clock.runFor(1000);await waitReads(2);await blocked();
    for(const id of purchases)assert.equal(await page.locator('#'+id).isVisible(),false);
    await reply(1,{sucesso:false,codigo:'EVENTO_ENCERRADO',temporario:false,mensagem:'Evento encerrado.'});
    await page.locator('#event-language').selectOption('es');assert.equal(await page.locator('#eventSalesStatus').textContent(),'Este evento ya terminó.');
    assert.equal(await page.locator('#app').isVisible(),true);
  }));
  test(route+': malformed response offers retry and no purchase',()=>isolated(route,async({page,reply,blocked})=>{
    const data=catalog();delete data.validUntil;await reply(0,data);await page.locator('#app').waitFor({state:'visible'});await blocked();assert.equal(await page.locator('#retryTemporalEventLoad').isVisible(),true);
  }));
  test(route+': temporal envelope without lot projection retains legacy design',()=>isolated(route,async({page,reply,allowed})=>{
    await reply(0,catalog({projection:false}));await page.locator('#app').waitFor({state:'visible'});await allowed();assert.equal(await page.locator('#tickets > .ticket').count(),1);
  }));
}
