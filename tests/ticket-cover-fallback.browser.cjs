'use strict';
// Isolated CI only. Uses the real static page and fully intercepted synthetic
// responses. No actual artwork or real signed ticket is read or requested.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),ORIGIN='https://ticket-fixture.invalid';
const EVENT='EVT-09112026-GESTAO-PARA-SALAO-DE-BELEZA-F44A0C2F';
const ART='/assets/eventos/gestao-salao-beleza-20261109-b2df6f6dff7fef3e.png';
const CODE='CT-LOCAL-FALLBACK',SIG='LOCAL-SYNTHETIC-SIGNATURE-ONLY';
const HTML=fs.readFileSync(path.join(ROOT,'ingresso/index.html'),'utf8');
const ENDPOINT=HTML.match(/var BASE='([^']+)'/)[1];
const COVER=fs.readFileSync(path.join(__dirname,'fixtures/ticket-cover-fallback.svg'));
const PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=','base64');
const QR='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="270" height="270"><rect width="270" height="270" fill="white"/><rect x="20" y="20" width="230" height="230" fill="none" stroke="black" stroke-width="12"/><text x="135" y="135" text-anchor="middle" font-family="sans-serif" font-size="17">NOT A TICKET QR</text></svg>').toString('base64');
const REGISTERED='data:image/svg+xml;base64,'+COVER.toString('base64');
const FILES={'/ingresso/':'ingresso/index.html','/assets/public-i18n.js':'assets/public-i18n.js','/assets/checkout-language.js':'assets/checkout-language.js','/assets/checkout-translations.js':'assets/checkout-translations.js','/assets/checkout-language.css':'assets/checkout-language.css'};
async function fixture(browser,options){
 const context=await browser.newContext({viewport:{width:options.width,height:1000},serviceWorkers:'block'}),page=await context.newPage();
 const state={consultations:[],artRequests:0,unexpected:[],errors:[]};
 page.on('pageerror',error=>state.errors.push(error.message));
 await context.addInitScript(locale=>{
  if(window!==window.top)return;localStorage.setItem('ct-home-locale',locale);
  window.__shares=[];window.__prints=0;window.__copies=[];
  window.print=()=>window.__prints++;
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>window.__shares.push(data)});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__copies.push(value)}});
 },options.locale||'pt-BR');
 await context.routeWebSocket('**/*',socket=>{state.unexpected.push('Unexpected websocket');socket.close();});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  try{
   if(url.origin===ORIGIN&&request.method()==='GET'){
    if(FILES[url.pathname]){
     const type=url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':'text/html';
     return route.fulfill({contentType:type+'; charset=utf-8',body:fs.readFileSync(path.join(ROOT,FILES[url.pathname]))});
    }
    if(url.pathname==='/assets/carioca-ticket-logo.png'||url.pathname==='/assets/carioca-ticket-simbolo.png')return route.fulfill({contentType:'image/png',body:PIXEL});
    if(url.pathname===ART){
     state.artRequests++;
     if(options.name==='broken')return route.fulfill({status:404,contentType:'text/plain',body:'Synthetic missing image'});
     // URL and layout are exercised, not production MIME/digest validation.
     return route.fulfill({contentType:'image/svg+xml',body:COVER});
    }
    throw Error('Unexpected local asset '+url.pathname);
   }
   assert.equal(request.url(),ENDPOINT,'No other external destination is allowed');assert.equal(request.method(),'POST');
   const fields=new URLSearchParams(request.postData()||'');
   assert.deepEqual([...fields.keys()].sort(),['codigo','ctMinhaCariocaAction','ctMinhaCariocaRequestId','sig']);
   assert.equal(fields.get('ctMinhaCariocaAction'),'consultarIngressoSeguro');assert.equal(fields.get('codigo'),CODE);assert.equal(fields.get('sig'),SIG);
   state.consultations.push({codigo:fields.get('codigo'),sig:fields.get('sig')});
   const result={sucesso:true,ingresso:{nome:'Participante fictício',tipo:'Tipo fictício',lote:'Lote fictício',codigo:CODE,qrUrl:QR,status:'VÁLIDO SINTÉTICO'},evento:{id:EVENT,nome:options.title||'Evento Sintético de Teste',data:'09/11/2026',horario:'09h30 às 18h',local:'Local fictício',cidade:'Cidade fictícia',uf:'PE'},visual:{},seguranca:{autorizaEntrada:true,mensagem:'Instrução sintética preservada.'}};
   if(options.name==='other-event')result.evento.id='EVT-OTHER';
   if(options.name==='missing-id')delete result.evento.id;
   if(options.name==='registered-cover')result.visual.capaUrl=REGISTERED;
   if(options.name==='registered-poster')result.visual.posterUrl=REGISTERED;
   if(options.name==='denied'){result.sucesso=false;result.mensagem='Resposta sintética negada.';}
   const envelope=JSON.stringify({ctMinhaCariocaPost:true,id:fields.get('ctMinhaCariocaRequestId'),ok:true,resultado:result}).replace(/</g,'\\u003c');
   return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+envelope+',"*")</script>'});
  }catch(error){state.unexpected.push(String(error.message||error));await route.abort('blockedbyclient');}
 });
 await page.goto(ORIGIN+'/ingresso/'+(options.name==='invalid-input'?'':'?codigo='+CODE+'&sig='+SIG));
 if(['denied','invalid-input'].includes(options.name))await page.locator('#erro').waitFor({state:'visible'});
 else await page.locator('#ticket-view.show').waitFor();
 return {context,page,state};
}
(async()=>{
 const browser=await chromium.launch(),results=[];
 const evidence=process.env.CT_EVIDENCE_DIR||'test-results/ticket-cover-fallback';fs.mkdirSync(evidence,{recursive:true});
 const cases=[];
 for(const locale of ['pt-BR','en-US','es','zh-Hans'])for(const width of [320,390,1440])cases.push({name:'fallback',locale,width});
 for(const name of ['broken','other-event','missing-id','registered-cover','registered-poster'])for(const width of [320,1440])cases.push({name,locale:'pt-BR',width});
 for(const width of [320,390,1440])cases.push({name:'long-title',locale:'pt-BR',width,title:'Nome Sintético Muito Longo '+ 'PalavraSemEspacos'.repeat(9)});
 cases.push({name:'escaped-title',locale:'pt-BR',width:390,title:'<img src=x onerror=alert(1)> & "Nome"'});
 cases.push({name:'denied',locale:'pt-BR',width:390},{name:'invalid-input',locale:'pt-BR',width:390});
 try{
  for(const options of cases){
   const label=options.name+'-'+options.locale+'-'+options.width;let f;
   try{
    f=await fixture(browser,options);const {page,state}=f;
    if(['denied','invalid-input'].includes(options.name)){
     assert.equal(await page.locator('.event-approved-cover').count(),0);assert.equal(state.artRequests,0);assert.equal(state.consultations.length,options.name==='denied'?1:0);
     assert.deepEqual(state.unexpected,[]);assert.deepEqual(state.errors,[]);results.push({name:label,passed:true});continue;
    }
    const hasFallback=['fallback','broken','long-title','escaped-title'].includes(options.name),registered=options.name.startsWith('registered-');
    assert.equal(state.consultations.length,1);assert.equal(await page.locator('.qr').getAttribute('src'),QR);
    assert.equal(await page.locator('.event-approved-cover').count(),hasFallback?1:0);assert.equal(await page.locator('.event-cover').count(),registered?1:0);
    if(!registered){assert(await page.locator('.event-title').isVisible());assert.equal(await page.locator('.event-title').textContent(),options.title||'Evento Sintético de Teste');}
    if(registered){assert.equal(await page.locator('.event-cover img').getAttribute('src'),REGISTERED);assert.equal(await page.locator('.event-title').count(),0);}
    if(hasFallback){
     const image=page.locator('.event-approved-cover img');assert.equal(await image.getAttribute('src'),ART);
     if(options.name==='broken'){await image.evaluate(el=>el.complete?null:new Promise(resolve=>el.addEventListener('error',resolve,{once:true})));assert.equal(await image.evaluate(el=>el.naturalWidth),0);assert(await page.locator('.event-title').isVisible());}
     else{
      await image.evaluate(el=>el.decode());
      const m=await image.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,nw:el.naturalWidth,nh:el.naturalHeight,fit:getComputedStyle(el).objectFit,radius:getComputedStyle(el).borderRadius}));
      assert.equal(m.nw,1672);assert.equal(m.nh,941);assert.equal(m.fit,'contain');assert.equal(m.radius,'0px');assert(Math.abs(m.width/m.height-1672/941)<0.01);
     }
     const title=await page.locator('.event-title').boundingBox(),cover=await page.locator('.event-approved-cover').boundingBox();assert(title.y+title.height<=cover.y+1,'Independent title does not overlap artwork');
    }
    assert.equal(state.artRequests,hasFallback?1:0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile horizontal overflow');
    const whatsapp=await page.locator('#share-whatsapp').getAttribute('href');
    await page.locator('#share-ticket').click();const shared=await page.evaluate(()=>window.__shares[0].url);
    assert.equal(new URL(shared).searchParams.get('codigo'),CODE);assert.equal(new URL(shared).searchParams.get('sig'),SIG);
    assert.equal(new URL(whatsapp).searchParams.get('text').split('\n').at(-1),shared);
    await page.locator('#save-pdf').click();assert.equal(await page.evaluate(()=>window.__prints),1);
    for(const locale of ['en-US','es','zh-Hans',options.locale])await page.locator('#checkoutLanguage').selectOption(locale);
    assert.equal(state.consultations.length,1);assert.equal(await page.locator('.qr').getAttribute('src'),QR);
    if(!registered)assert.equal(await page.locator('.event-title').textContent(),options.title||'Evento Sintético de Teste');
    await page.screenshot({path:path.join(evidence,label+'.png'),fullPage:true});
    await page.emulateMedia({media:'print'});assert(await page.locator('.qr').isVisible());assert.equal(await page.locator('.actions').isVisible(),false);
    if(!registered){assert(await page.locator('.event-title').isVisible());assert.equal(await page.locator('.event-title').evaluate(el=>getComputedStyle(el).color),'rgb(17, 17, 17)');}
    if(hasFallback&&options.name!=='broken'){
     const image=page.locator('.event-approved-cover img'),box=await image.boundingBox();
     assert.equal(await image.evaluate(el=>getComputedStyle(el).objectFit),'contain');assert(box.width<=96*96/25.4+1);assert(Math.abs(box.width/box.height-1672/941)<0.01);
    }
    await page.screenshot({path:path.join(evidence,label+'-print.png'),fullPage:true});
    if(options.width===1440){
     const pdf=await page.pdf({path:path.join(evidence,label+'.pdf'),format:'A4',printBackground:true});
     const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;assert(pages>0,'Chromium PDF page dictionaries readable');
     if(['fallback','broken'].includes(options.name))assert.equal(pages,1,'Ticket artwork, details and QR fit on one A4 page');
    }
    assert.deepEqual(state.errors,[]);assert.deepEqual(state.unexpected,[]);results.push({name:label,passed:true});
   }catch(error){results.push({name:label,passed:false,error:String(error.stack||error)});if(f)await f.page.screenshot({path:path.join(evidence,label+'-failure.png'),fullPage:true}).catch(()=>{});}
   finally{if(f)await f.context.close();}
  }
 }finally{await browser.close();fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({syntheticOnly:true,actualArtworkTested:false,productionRequestsForwarded:0,results},null,2));}
 console.log(JSON.stringify(results,null,2));if(results.some(result=>!result.passed))process.exitCode=1;
})();
