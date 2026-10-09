// Local files and mocked RPC only. Every other request is aborted.
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),ORIGIN='http://127.0.0.1:4177',ERA='EVT-23112026-ERA-BEAUTY-EAC4B673';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const money=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const round=n=>Math.round(n*100)/100;
function summary(base,fee=round(base*.1),extra=0,absorbed=0){return {subtotalIngressos:base,taxaComprador:fee,adicionaisComprador:extra,totalComprador:round(base+fee+extra),taxaProdutor:absorbed,taxaCtTotal:round(fee+absorbed),taxaCtPercentual:10,pagadorTaxa:absorbed?'PRODUTOR':'COMPRADOR'};}
function catalog(eventId=ERA){return {sucesso:true,evento:{id:eventId,nome:'ERA BEAUTY · Preview local',data:'23/11/2026',local:'Recife'},visual:{capaUrl:'/assets/eventos/era-beauty-capa-oficial-20261008.jpg',descricaoCurta:'Encontro de mulheres empreendedoras da beleza.'},politicaComercial:{ativa:true},identidadeCliente:{emailObrigatorio:false},tipos:[{id:'IND',nome:'Individual',capacidadePorVenda:1,lotes:[{id:'I',nome:'Lote atual',precoNumero:87,preco:money(87),quantidadeLimitada:false}]},{id:'PAIR',nome:'Casadinha',capacidadePorVenda:2,lotes:[{id:'P',nome:'Pacote para duas pessoas',precoNumero:120,preco:money(120),quantidadeLimitada:false}]},{id:'FREE',nome:'Gratuito',capacidadePorVenda:1,lotes:[{id:'F',nome:'Gratuito',precoNumero:0,preco:money(0),quantidadeLimitada:false}]}]};}
async function fixture(browser,opts={}){
 const ctx=await browser.newContext({viewport:{width:opts.width||1365,height:900},serviceWorkers:'block'}),page=await ctx.newPage();
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 let quotes=0,reads=0;
 const eventId=opts.eventId||ERA;
 const data=opts.catalog||catalog(eventId);
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===ORIGIN){
   if(/ct-analytics|pwa-register/.test(url.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
   let file=path.join(ROOT,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'image/png'});
  }
  if(url.origin!=='https://script.google.com'||req.method()!=='POST')return route.abort();
  const params=new URLSearchParams(req.postData()),method=params.get('metodo'),args=JSON.parse(params.get('argsJson')||'[]'),p=args[0];calls.push({method,args});
  let result;
  if(method==='ctCheckoutPublicoCarregarEventoPROD'||method==='ctEventoPublicoCarregarPROD')result=data;
  else if(method==='ctPrecoPublicoLeituraPROD'){
   reads++;
   result={sucesso:true,eventoId:eventId,canal:p.canal,ofertas:data.tipos.flatMap(t=>t.lotes.map(l=>({tipoId:t.id,loteId:l.id,capacidadePorVenda:t.capacidadePorVenda,quantidade:p.quantidade||1,status:'CONFIRMADO',semTaxaConfirmada:eventId!==ERA||l.precoNumero===0,resumo:summary(l.precoNumero*(p.quantidade||1),p.tipoId?0:round(l.precoNumero*.1))}))).filter(o=>!p.tipoId||(o.tipoId===p.tipoId&&o.loteId===p.loteId))};
   if(opts.read)result=await opts.read(p,reads,result);
  }else if(method==='ctPoliticaComercialPreviewPublicoPROD'){
   quotes++;result={sucesso:true,degradado:false,rolloutAtivo:true,revisao:'TEST-R1',resumo:summary(round(p.precoUnitario*p.quantidade))};
   if(opts.quote)result=await opts.quote(p,quotes,result);
  }else if(method==='ctCuponsPublicoValidarSeguroPROD'){
   result={sucesso:true,valido:true,cupom:{codigo:p.codigo},calculo:{valorOriginalTotal:87*p.quantidade,descontoTotal:10*p.quantidade,valorFinalTotal:77*p.quantidade}};
  }else if(method==='ctCheckoutPixPublicoIniciarPROD')result=opts.order||{sucesso:false,mensagem:'Local mock'};
  else if(method==='ctCheckoutPixPublicoConsultarPROD'||method==='ctCheckoutPixPublicoStatusLocalPROD')result=opts.order||{sucesso:false};
  else throw Error('Unexpected mocked RPC '+method);
  const payload={ctMinhaCariocaPost:true,id:params.get('ctMinhaCariocaRequestId'),ok:true,resultado:result};
  await route.fulfill({contentType:'text/html; charset=utf-8',body:'<script>top.postMessage('+JSON.stringify(payload).replace(/</g,'\\u003c')+',"*")</script>'});
 });
 const routeName=opts.route||'checkout';
 await page.goto(ORIGIN+'/'+routeName+'/?evento='+eventId);
 return {page,calls,ctx,async select(type='IND',lot='I'){await page.locator('#typeSelect').selectOption(type);await page.locator('#lotSelect').selectOption(lot);},async total(n){await page.waitForFunction(v=>document.querySelector('#summaryPrice').textContent===v,money(n));},async close(){assert.deepEqual(errors,[]);await ctx.close();}};
}
async function checkDialog(f){
 const p=f.page,calls=f.calls.length,storage=await p.evaluate(()=>JSON.stringify([localStorage,sessionStorage])),history=await p.evaluate(()=>history.length);
 await p.locator('#feeInfo').focus();await p.keyboard.press('Enter');
 assert(await p.locator('#ctFeeDialog').evaluate(e=>e.open));
 assert.match(await p.locator('#ctFeeText').textContent(),/Quando cobrada do comprador/);
 await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Fechar');
 await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Fechar');
 await p.evaluate(()=>{document.querySelector('#feeInfo').click();document.querySelector('#feeInfo').click();});
 assert.equal(await p.locator('dialog[open]').count(),1);
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.id),'feeInfo');
 assert.equal(f.calls.length,calls);assert.equal(await p.evaluate(()=>history.length),history);
 assert.equal(await p.evaluate(()=>JSON.stringify([localStorage,sessionStorage])),storage);
}
(async()=>{
 const browser=await chromium.launch({headless:true});let passed=0;
 async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
 try{
  for(const width of [320,360,390,1365])await test('composition, package and accessible dialog '+width,async()=>{
   const f=await fixture(browser,{width});await f.select('PAIR','P');await f.total(132);
   assert.equal(await f.page.locator('#feeBase').textContent(),money(120));assert.equal(await f.page.locator('#feePlatform').textContent(),money(12));
   assert.match(await f.page.locator('#summaryAccess').textContent(),/2 acessos por pacote/);
   await f.page.locator('#buyerName').fill('Teste local');await f.page.locator('[data-name]').fill('Convidada local');await checkDialog(f);
   assert.equal(await f.page.locator('[data-name]').inputValue(),'Convidada local');assert.equal(await f.page.locator('#buyerName').inputValue(),'Teste local');
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.CT_EVIDENCE_DIR){fs.mkdirSync(process.env.CT_EVIDENCE_DIR,{recursive:true});await f.page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await f.page.screenshot({path:path.join(process.env.CT_EVIDENCE_DIR,'checkout-'+width+'.png'),fullPage:true});await f.page.locator('#feeInfo').click();await f.page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await f.page.screenshot({path:path.join(process.env.CT_EVIDENCE_DIR,'dialog-'+width+'.png')});}
   await f.close();
  });
  await test('coupon preserved; changing quantity discards late response',async()=>{
   const f=await fixture(browser,{quote:async(p,n,r)=>{await delay(n===1?900:20);return r;}});await f.select();await delay(250);
   assert(![money(87),money(0)].includes(await f.page.locator('#summaryPrice').textContent()));
   await f.page.locator('#quantity').fill('2');await f.total(191.4);await delay(950);await f.total(191.4);
   await f.page.locator('#couponToggle').click();await f.page.locator('#couponCode').fill('TEST10');await f.page.locator('#couponApply').click();await f.total(169.4);await checkDialog(f);
   assert.equal(await f.page.locator('#couponCode').inputValue(),'TEST10');assert.equal(await f.page.locator('#quantity').inputValue(),'2');await f.close();
  });
  await test('missing fee never becomes zero',async()=>{
   const f=await fixture(browser,{quote:async(p,n,r)=>{delete r.resumo.taxaComprador;return r;}});await f.select();await f.page.locator('#feeRetry').waitFor({state:'visible'});
   assert.equal(await f.page.locator('#summaryPrice').textContent(),'A confirmar');assert(await f.page.locator('#feeInfo').isVisible());await checkDialog(f);await f.close();
  });
  for(const route of ['checkout','checkout-v2'])for(const mode of ['pending','unknown','failed','stale'])await test(route+' '+mode+' keeps explanation and no fake amounts',async()=>{
   const data=catalog('OTHER');data.politicaComercial.ativa=false;
   const f=await fixture(browser,{route,width:route==='checkout'?320:390,eventId:'OTHER',catalog:data,read:async(p,n,r)=>{
    if(mode==='pending')await delay(1500);
    if(mode==='failed')return {sucesso:false};
    if(mode==='stale')return {...r,cacheStale:true,degradado:true};
    return {...r,ofertas:r.ofertas.map(o=>({...o,status:'INDEFINIDO',resumo:undefined}))};
   }});await f.select();if(mode!=='pending')await f.page.waitForFunction(()=>document.querySelector('#summaryPrice').textContent==='A confirmar');
   assert(await f.page.locator('#feeInfo').isVisible());assert.equal(await f.page.locator('#feePlatform').textContent(),'A confirmar');
   if(process.env.CT_EVIDENCE_DIR&&mode==='unknown')await f.page.screenshot({path:path.join(process.env.CT_EVIDENCE_DIR,route+'-unknown.png'),fullPage:true});
   await f.page.locator('#feeInfo').click();assert.match(await f.page.locator('#ctFeeComposition').textContent(),/ainda não foram confirmados/);await f.page.keyboard.press('Escape');
   assert(!f.calls.some(c=>/IniciarPROD|Reservar/.test(c.method)));await f.close();
  });
  await test('legacy presentation does not add a quote revision to orders',async()=>{
   const f=await fixture(browser,{eventId:'OTHER'});await f.select();await f.total(87);await checkDialog(f);
   await f.page.locator('#buyerName').fill('Teste');await f.page.locator('#buyerCpf').fill('00000000000');await f.page.locator('#buyerWhatsapp').fill('81999999999');await f.page.locator('#payButton').click();
   await f.page.locator('#modalBg.open').waitFor();assert(!('politicaRevisaoVista' in f.calls.find(c=>c.method==='ctCheckoutPixPublicoIniciarPROD').args[0]));await f.close();
  });
  for(const route of ['evento','evento-v2'])for(const width of [320,360,390,1365])await test('event totals and minimum available package '+route+' '+width,async()=>{
   const data=catalog();data.tipos.pop();
   const f=await fixture(browser,{route,width,catalog:data});await f.page.locator('#tickets .ct-price-total').first().waitFor();
   assert.match(await f.page.locator('#startingPrice').textContent(),/95,70/);assert.match(await f.page.locator('#tickets').textContent(),/132,00/);
   await f.page.locator('#tickets .ct-fee-link').last().click();assert.match(await f.page.locator('#ctFeeComposition').textContent(),/120,00.*12,00.*132,00/);
   if(process.env.CT_EVIDENCE_DIR){await f.page.keyboard.press('Escape');await f.page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await f.page.screenshot({path:path.join(process.env.CT_EVIDENCE_DIR,route+'-'+width+'.png'),fullPage:true});}
   await f.close();
  });
  await test('unknown offer prevents a misleading minimum',async()=>{
   const f=await fixture(browser,{route:'evento',read:async(p,n,r)=>{r.ofertas[0]={...r.ofertas[0],status:'INDEFINIDO',resumo:undefined};return r;}});
   await f.page.locator('#tickets .ct-price-total').first().waitFor();assert.match(await f.page.locator('#startingPrice').textContent(),/Total a confirmar/);await f.close();
  });
  for(const [name,change] of [['absorbed',r=>r.resumo=summary(87,0,0,8.7)],['fixed',r=>r.resumo=summary(87,8.7,3)],['free',r=>r.resumo=summary(0,0)]])await test('V2 '+name+' shows authoritative composition',async()=>{
   const f=await fixture(browser,{route:'checkout-v2',quote:async(p,n,r)=>{change(r);return r;}});await f.select(name==='free'?'FREE':'IND',name==='free'?'F':'I');await f.page.locator('#feeSummary').waitFor({state:'visible'});await checkDialog(f);await f.close();
  });
  await test('order summary uses frozen snapshot, survives modal and recovery',async()=>{
   const order={sucesso:true,pedido:{pedidoId:'LOCAL-ORDER',status:'AGUARDANDO_PAGAMENTO',valorTotal:95.7,expiraEm:new Date(Date.now()+600000).toISOString()},consultaToken:'LOCAL-TOKEN',financeiro:{...summary(87),comissoes:[]},pagamento:{forma:'PIX'},ingressos:[]};
   const f=await fixture(browser,{order});await f.select();await f.total(95.7);
   await f.page.locator('#buyerName').fill('Teste');await f.page.locator('#buyerCpf').fill('00000000000');await f.page.locator('#buyerWhatsapp').fill('81999999999');await f.page.locator('#payButton').click();await f.page.locator('#orderComposition').waitFor({state:'visible'});
   assert.match(await f.page.locator('#orderComposition').textContent(),/95,70/);const before=f.calls.length;
   await f.page.locator('#orderComposition button').click();await f.page.keyboard.press('Escape');assert.equal(f.calls.length,before);
   await f.page.reload();await f.page.locator('#orderComposition').waitFor({state:'visible'});assert.match(await f.page.locator('#orderComposition').textContent(),/87,00.*8,70/s);await f.close();
  });
  await test('Back does not create dialog navigation loops',async()=>{
   const f=await fixture(browser);await f.page.goto(ORIGIN+'/evento/?evento='+ERA);await f.page.locator('#buyHero').click();await f.select();await f.total(95.7);await checkDialog(f);await f.page.goBack();assert(new URL(f.page.url()).pathname==='/evento/');await f.close();
  });
  console.log('PASS fee-transparency.browser: '+passed+' scenarios, all network mocked');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
