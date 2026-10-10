'use strict';
// Isolated signed-ticket fixtures only. No request is forwarded; no production data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),ORIGIN='http://127.0.0.1:4182';
const CODE='CT-LOCAL-LANGUAGE',SIG='LOCAL-SYNTHETIC-SIGNATURE-ONLY';
const ENDPOINT='https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
const PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=';
// Deliberately not a redeemable ticket QR. Layout and byte preservation only.
const QR='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><path fill="black" d="M20 20h60v60H20zM160 20h60v60h-60zM20 160h60v60H20zM100 100h20v20h-20zM140 120h20v40h-20zM180 180h40v20h-40z"/><text x="90" y="220" font-size="12">LOCAL FIXTURE</text></svg>').toString('base64');
const files={'/ingresso/':'ingresso/index.html','/assets/public-i18n.js':'assets/public-i18n.js','/assets/checkout-language.js':'assets/checkout-language.js','/assets/checkout-translations.js':'assets/checkout-translations.js','/assets/checkout-language.css':'assets/checkout-language.css'};
async function fixture(browser,locale,width,options={}){
 const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'}),page=await context.newPage();
 const state={consultations:[],unexpected:[],errors:[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await context.addInitScript(({locale,noStorage})=>{
  if(window!==window.top)return;
  if(noStorage){Storage.prototype.getItem=()=>{throw new DOMException('blocked','SecurityError')};Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError')};}
  else localStorage.setItem('ct-home-locale',locale);
  window.__shares=[];window.__copies=[];window.__prints=0;
  window.print=()=>window.__prints++;
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{if(window.__abortShare)throw new DOMException('cancel','AbortError');window.__shares.push(data);}});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copies.push(text)}});
 },{locale,noStorage:!!options.noStorage});
 await context.routeWebSocket('**/*',socket=>{state.unexpected.push('websocket');socket.close();});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  try{
   if(url.origin===ORIGIN&&req.method()==='GET'){
    if(files[url.pathname]){
     const type=url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':'text/html';
     const body=options.noCore&&url.pathname.endsWith('/public-i18n.js')?'// absent core fixture':fs.readFileSync(path.join(ROOT,files[url.pathname]));
     return route.fulfill({contentType:type+'; charset=utf-8',body});
    }
    if(url.pathname==='/assets/carioca-ticket-logo.png')return route.fulfill({contentType:'image/png',body:Buffer.from(PIXEL.split(',')[1],'base64')});
    throw Error('unknown local asset '+url.pathname);
   }
   assert.equal(req.url(),ENDPOINT);assert.equal(req.method(),'POST');
   const fields=new URLSearchParams(req.postData()||'');assert.deepEqual([...fields.keys()].sort(),['codigo','ctMinhaCariocaAction','ctMinhaCariocaRequestId','sig']);
   assert.equal(fields.get('ctMinhaCariocaAction'),'consultarIngressoSeguro');assert.equal(fields.get('codigo'),CODE);assert.equal(fields.get('sig'),SIG);
   state.consultations.push({codigo:fields.get('codigo'),sig:fields.get('sig')});
   const result={sucesso:true,ingresso:{nome:'Participante Sintético Cupom VIP',tipo:'Participante Premium',lote:'Cupom VIP',codigo:CODE,qrUrl:QR,status:'VÁLIDO'},evento:{nome:'Evento Original Sintético',data:'10/10/2026',horario:'20h',local:'Local Original',cidade:'Recife',uf:'PE'},seguranca:{autorizaEntrada:true,mensagem:'Instrução original do ingresso sintético.'}};
   const payload=JSON.stringify({ctMinhaCariocaPost:true,id:fields.get('ctMinhaCariocaRequestId'),ok:true,resultado:result}).replace(/</g,'\\u003c');
   return route.fulfill({contentType:'text/html',body:'<!doctype html><script>window.top.postMessage('+payload+',"*")</script>'});
  }catch(error){state.unexpected.push(error.message);await route.abort('blockedbyclient');}
 });
 await page.goto(ORIGIN+'/ingresso/?codigo='+CODE+'&sig='+SIG);
 await page.locator('#ticket-view.show').waitFor();
 return {context,page,state};
}
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
 const evidence=process.env.CT_EVIDENCE_DIR||'test-results/checkout-language';fs.mkdirSync(evidence,{recursive:true});
 try{
  for(const locale of ['pt-BR','en-US','es','zh-Hans'])for(const width of [320,390,1440]){
   const name='ticket-'+locale+'-'+width;let f;
   try{
    f=await fixture(browser,locale,width);const {page,state}=f;
    assert.equal(state.consultations.length,1);assert.equal(await page.locator('.qr').getAttribute('src'),QR);
    assert((await page.locator('#ticket-view').textContent()).includes('Participante Sintético Cupom VIP'));
    await page.locator('#save-pdf').click();assert.equal(await page.evaluate(()=>window.__prints),1);
    await page.locator('#share-ticket').click();await page.locator('#share-ticket').click();assert.equal(await page.evaluate(()=>window.__shares.length),2);
    const signed=await page.evaluate(()=>window.__shares[0].url);assert.equal(new URL(signed).searchParams.get('sig'),SIG);
    await page.evaluate(()=>window.__abortShare=true);await page.locator('#share-ticket').click();assert.equal(await page.evaluate(()=>window.__copies.length),0);
    await page.evaluate(()=>Object.defineProperty(navigator,'share',{value:undefined}));await page.locator('#share-ticket').click();assert.equal(await page.evaluate(()=>window.__copies[0]),signed);
    for(const target of ['en-US','zh-Hans',locale])await page.locator('#checkoutLanguage').selectOption(target);
    assert.equal(state.consultations.length,1);assert.equal(await page.locator('.qr').getAttribute('src'),QR);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'screen overflow');
    await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('#checkoutLanguageControl').isVisible(),false);assert.equal(await page.locator('.actions').isVisible(),false);
    assert(await page.locator('.qr').isVisible());assert((await page.locator('.qr').boundingBox()).width>=240);
    await page.screenshot({path:path.join(evidence,name+'-print.png'),fullPage:true});
    if(width===1440)await page.pdf({path:path.join(evidence,name+'.pdf'),format:'A4',printBackground:true});
    assert.deepEqual(state.errors,[]);assert.deepEqual(state.unexpected,[]);await f.context.close();f=null;results.push({name,passed:true});
   }catch(error){results.push({name,passed:false,error:error.stack});if(f){await f.page.screenshot({path:path.join(evidence,name+'-failure.png'),fullPage:true}).catch(()=>{});await f.context.close();}}
  }
  for(const option of ['noStorage','noCore']){const f=await fixture(browser,'en-US',390,{[option]:true});try{assert.equal(await f.page.locator('#save-pdf').textContent(),'📄 Salvar em PDF');assert.equal(f.state.consultations.length,1);assert.deepEqual(f.state.errors,[]);assert.deepEqual(f.state.unexpected,[]);results.push({name:option,passed:true});}finally{await f.context.close();}}
 }finally{await browser.close();fs.writeFileSync(path.join(evidence,'ticket-results.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify(results,null,2));if(results.some(r=>!r.passed))process.exitCode=1;
})();
