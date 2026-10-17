'use strict';
// All browser traffic is intercepted, with offline mode and a dead proxy as backstops.
// Only catalog/status fixtures are served; payment initiation is always a test failure.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),ORIGIN='http://127.0.0.1:4188',EVENT='EVT-TEMPORAL-BROWSER';
const endpoints=new Set(['https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec','https://script.google.com/macros/s/AKfycbyhx6mnGJMsgpGmx-C1r6ZUXbrE66-X6Rkusp1ulVOGcDfJfIs-jgysWp1PfkqB1UC3hg/exec']);
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=','base64');
function response(index=0,options={}){
 const now=Date.now(),iso=n=>new Date(n).toISOString(),current=index===0?'L1':'L2';
 const lots=[{id:'L1',nome:'Lote inicial',statusVenda:index===0?'ATUAL':'ENCERRADO',disponivelParaCompra:index===0&&!options.pending,precoNumero:25,preco:'R$ 25,00',quantidadeLimitada:true,disponiveis:options.pending?0:2,motivoIndisponibilidade:options.pending?'RESERVAS_PENDENTES':null},{id:'L2',nome:'Lote futuro',statusVenda:index===0?'EM_BREVE':'ATUAL',disponivelParaCompra:index>0,precoNumero:30,preco:'R$ 30,00',quantidadeLimitada:false,disponiveis:null,antecipado:index>0}];
 return {sucesso:true,evento:{id:EVENT,nome:'Evento sintético temporal',temporal:{state:'TEMPORAL_V1',temporalVersion:1,inicioEm:iso(now-1000),fimEm:iso(now+3600000),fusoHorario:'America/Recife'}},identidadeCliente:{emailObrigatorio:false},visual:{},temporalVersion:1,temporalEvaluatedAt:iso(now),serverNow:iso(now),nextTransitionAt:iso(now+15000),validUntil:iso(now+15000),tipos:options.pending?[]:[{id:'T',nome:'Individual',capacidadePorVenda:1,lotes:[lots[index===0?0:1]]}],lotesVenda:{versao:1,avaliadoEm:iso(now),tipos:[{tipoId:'T',tipoNome:'Individual',loteAtualId:current,lotes:lots}]}};
}
// Fail before launching a browser if a catalog constructor or its state mapping
// is broken; the full browser scenarios below remain mandatory.
function validateFixtureResponses(){
 for(const [index,options] of [[0,{}],[1,{}],[0,{pending:true}]]){
  const value=response(index,options),expected=index===0?'L1':'L2',type=value.lotesVenda.tipos[0];
  assert.equal(value.sucesso,true);assert.equal(value.evento.id,EVENT);
  assert.equal(type.loteAtualId,expected);assert.equal(type.lotes.length,2);
  assert.deepEqual(type.lotes.filter(lot=>lot.statusVenda==='ATUAL').map(lot=>lot.id),[expected]);
  const available=type.lotes.filter(lot=>lot.disponivelParaCompra).map(lot=>lot.id);
  assert.deepEqual(available,options.pending?[]:[expected]);
  assert.deepEqual(value.tipos.flatMap(ticket=>ticket.lotes.map(lot=>lot.id)),available);
  if(options.pending)assert.equal(type.lotes[0].motivoIndisponibilidade,'RESERVAS_PENDENTES');
  assert.equal(JSON.parse(JSON.stringify(value)).lotesVenda.tipos[0].lotes.length,2);
 }
}
async function fixture(browser,routePath,mobile,options={}){
 const context=await browser.newContext({offline:true,serviceWorkers:'block',viewport:mobile?{width:390,height:844}:{width:1365,height:900},isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage(),state={catalogs:0,consults:0,statuses:0,unexpected:[],errors:[],next:0,trace:[]};
 const trace=entry=>{state.trace.push(entry);if(state.trace.length>40)state.trace.shift();};
 const address=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch(_){return 'unavailable';}};
 page.on('pageerror',e=>{state.errors.push(e.message);trace({kind:'pageerror',message:e.message.slice(0,500)});});
 page.on('requestfailed',request=>trace({kind:'requestfailed',method:request.method(),url:address(request.url()),error:request.failure()?.errorText}));
 page.on('framenavigated',frame=>trace({kind:'frame',main:frame===page.mainFrame(),url:address(frame.url())}));
 // Observe real bridge messages without creating, replacing or accepting one.
 await context.addInitScript(()=>{
  if(window!==window.top)return;
  window.__temporalFixtureMessages=[];
  window.addEventListener('message',event=>{
   const value=event.data;if(!value||value.ctMinhaCariocaPost!==true)return;
   const messages=window.__temporalFixtureMessages;
   messages.push({origin:event.origin,ok:value.ok===true,hasId:typeof value.id==='string',hasResult:!!value.resultado});
   if(messages.length>12)messages.shift();
  });
 });
 async function diagnose(stage,error){
  let timer;
  const ui=await Promise.race([page.evaluate(()=>{
   const node=id=>{const n=document.getElementById(id);return n?{hidden:n.hidden||n.classList.contains('hidden'),text:n.textContent.slice(0,300)}:null;};
   return {readyState:document.readyState,visibility:document.visibilityState,loading:node('loading'),closed:node('closedPanel'),lots:node('temporalLotList'),eventName:node('eventName'),typeOptions:document.getElementById('typeSelect')?.options.length,
    helpers:{clock:!!window.CTPublicCatalogClock,lots:!!window.CTPublicLotStatus,language:!!window.CTCheckoutLanguage,bridge:!!window.google?.script?.run},messages:window.__temporalFixtureMessages||[]};
  }).catch(e=>({unavailable:e.message.slice(0,300)})),new Promise(resolve=>{timer=setTimeout(()=>resolve({unavailable:'snapshot timeout'}),3000);})]);
  clearTimeout(timer);
  console.error('CHECKOUT_TEMPORAL_FIXTURE_FAILURE '+JSON.stringify({stage,route:routePath,mobile,scenario:options.recover?'recovery':options.pending?'pending':'rotation',error:String(error.message).slice(0,700),catalogs:state.catalogs,consults:state.consults,statuses:state.statuses,errors:state.errors.slice(0,12),unexpected:state.unexpected.slice(0,12),trace:state.trace,ui}));
 }
 if(options.recover)await context.addInitScript(({event})=>localStorage.setItem('CT_CHECKOUT_RECOVERY_'+event,JSON.stringify({pedidoId:'PED-LOCAL-PAID',token:'LOCAL-ONLY'})),{event:EVENT});
 await context.routeWebSocket('**/*',s=>{state.unexpected.push('websocket');s.close();});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  trace({kind:'request',method:request.method(),url:address(request.url())});
  try{
   if(url.origin===ORIGIN&&request.method()==='GET'){
    if(['/pwa-register.js','/assets/ct-analytics.js'].includes(url.pathname))return route.fulfill({contentType:'application/javascript',body:'// Explicit no-op: telemetry/PWA disabled in isolated fixture.'});
    if(url.pathname==='/manifest.webmanifest')return route.fulfill({contentType:'application/manifest+json',body:'{}'});
    if(url.pathname==='/assets/carioca-ticket-icon-192.png')return route.fulfill({contentType:'image/png',body:pixel});
    const relative=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
    const file=path.resolve(ROOT,'.'+relative);
    assert(file.startsWith(ROOT+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile(),'undeclared static resource');
    assert(/\.(?:html|js|css)$/.test(file),'unapproved static type');
    return route.fulfill({contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file)});
   }
   assert(endpoints.has(request.url())&&request.method()==='POST','unexpected destination');
   const fields=new URLSearchParams(request.postData()||'');assert.equal(fields.get('ctMinhaCariocaAction'),'publicRpc');
   assert.deepEqual([...fields.keys()].sort(),['argsJson','ctMinhaCariocaAction','ctMinhaCariocaRequestId','metodo']);
   const method=fields.get('metodo'),args=JSON.parse(fields.get('argsJson'));let result;
   trace({kind:'rpc',method});
   if(method==='ctCheckoutPublicoCarregarEventoPROD'){state.catalogs++;assert.equal(args[0],EVENT);result=options.ended?{sucesso:false,codigo:'EVENTO_ENCERRADO',temporario:false,mensagem:'Este evento já terminou.'}:response(state.next,options);}
   else if(options.recover&&['ctCheckoutPixPublicoConsultarPROD','ctCheckoutPixPublicoStatusLocalPROD','ctCheckoutPixPublicoReconciliarPROD'].includes(method)){
    assert.deepEqual(args,['PED-LOCAL-PAID','LOCAL-ONLY']);if(method.includes('Consultar'))state.consults++;else state.statuses++;
    result={sucesso:true,encontrado:true,pedido:{pedidoId:'PED-LOCAL-PAID',eventoId:EVENT,status:'PAGO',expiraEm:new Date(Date.now()+600000).toISOString()},pagamento:{forma:'PIX',pix:{}},ingressoEmitido:false,ingressos:[]};
   }else throw new Error('undeclared RPC '+method);
   const payload=JSON.stringify({ctMinhaCariocaPost:true,id:fields.get('ctMinhaCariocaRequestId'),ok:true,resultado:result}).replace(/</g,'\\u003c');
   return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><script>window.top.postMessage('+payload+',"*")</script>'});
  }catch(e){state.unexpected.push(e.message);return route.abort('blockedbyclient');}
 });
 try{
  await page.goto(ORIGIN+routePath+'?evento='+EVENT,{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
 }catch(error){await diagnose('startup',error);await context.close();throw error;}
 return {page,context,state,diagnose,async finish(){assert.deepEqual(state.errors,[]);assert.deepEqual(state.unexpected,[]);await context.close();}};
}
(async()=>{
 validateFixtureResponses();
 console.log('PASS checkout temporal fixture constructors: initial, successor and pending catalogs.');
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'},args:['--disable-background-networking','--disable-component-update','--disable-sync','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 let scenarios=0;
 try{for(const mobile of [false,true])for(const route of ['/checkout/','/checkout-v2/']){
  const f=await fixture(browser,route,mobile);await f.page.locator('#typeSelect').selectOption('T');await f.page.locator('#lotSelect').selectOption('L1');
  assert.equal(await f.page.locator('#payButton').isEnabled(),true);await f.page.locator('#buyerName').fill('Comprador sintético');
  f.state.next=1;await f.page.locator('#temporalRefresh').click();await f.page.locator('[data-lot-id="L2"][data-lot-state="ATUAL"]').waitFor();
  assert.equal(await f.page.locator('#typeSelect').inputValue(),'');assert.equal(await f.page.locator('#payButton').isDisabled(),true);assert.equal(await f.page.locator('#buyerName').inputValue(),'Comprador sintético');
  assert.match(await f.page.locator('#temporalLotList').textContent(),/Antecipado/);await f.finish();scenarios++;
  const pending=await fixture(browser,route,mobile,{pending:true});assert.match(await pending.page.locator('#temporalLotList').textContent(),/Aguardando liberação/);assert.equal(await pending.page.locator('#payButton').isDisabled(),true);await pending.finish();scenarios++;
  const paid=await fixture(browser,route,mobile,{recover:true,ended:true});await paid.page.locator('#pixPanel').waitFor({state:'visible'});assert.equal(paid.state.consults,1);assert.equal(await paid.page.locator('#closedPanel').isVisible(),false);await paid.page.locator('#refreshButton').click();for(let i=0;i<200&&paid.state.statuses<1;i++)await new Promise(resolve=>setTimeout(resolve,10));assert(paid.state.statuses>=1);await paid.finish();scenarios++;
 }}finally{await browser.close();}
 console.log('PASS checkout temporal browser: '+scenarios+' isolated scenarios; zero forwarded requests.');
})().catch(error=>{console.error(error);process.exitCode=1;});
