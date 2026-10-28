'use strict';
// Real page, offline fixtures only: no authentication, network RPC or production writes.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,...(process.env.CT_CHROMIUM_PATH?{executablePath:process.env.CT_CHROMIUM_PATH}:{}),proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'},args:['--disable-background-networking','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});});
after(async()=>{await browser?.close();});
async function fixture(run){
 const context=await browser.newContext({offline:true,serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!=='http://127.0.0.1'||route.request().method()!=='GET')return route.abort();
  const file=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
  let bytes=fs.readFileSync(file);
  if(u.pathname==='/produtor/')bytes=bytes.toString().replace('function carregarPainel(\n', 'window.__workspaceTest={state:state,el:el,load:carregarPainel,change:trocarEvento,reset:resetarEstado};\nfunction carregarPainel(\n');
  return route.fulfill({body:bytes,contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png'});
 });
 await context.routeWebSocket('**/*',s=>s.close());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1/produtor/');
 await page.evaluate(()=>{
  const t=window.__workspaceTest;
  t.state.token='SYNTHETIC';t.state.produtorAtual={id:'P-SYNTH',nome:'Produtor de teste',eventos:[{id:'A',nome:'Evento Alfa'},{id:'B',nome:'Evento Beta'}]};t.state.eventoAtual=t.state.produtorAtual.eventos[0];
  t.el.eventSelect.innerHTML='<option value="A">Evento Alfa</option><option value="B">Evento Beta</option>';
  t.el.producerSelect.innerHTML='<option value="P-SYNTH">Produtor de teste</option>';
  t.el.loginView.classList.add('hidden');t.el.portalView.classList.remove('hidden');t.el.refreshButton.disabled=false;
  window.__calls=[];
  const chain={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},ctPortalProdutorCarregarPainelIsoladoPROD(...args){window.__calls.push({success:this.success,failure:this.failure,args});}};
  window.google.script.run=chain;
 });
 try{await run(page);assert.deepEqual(errors,[]);}finally{await context.close();}
}
const result=(name='Evento Alfa')=>({autenticado:true,autorizado:true,sucesso:true,painel:{evento:{nome:name,status:'RASCUNHO'},resumo:{},checkinsRecentes:[]}});
async function reply(page,value,index=0){await page.evaluate(({value,index})=>window.__calls[index].success(value),{value,index});}
test('refresh immediate feedback, same-tick double click blocked and success announced',()=>fixture(async p=>{
 const state=await p.evaluate(()=>{const b=document.getElementById('refreshButton');b.click();b.click();return {calls:window.__calls.length,text:b.textContent,busy:b.getAttribute('aria-busy'),disabled:b.disabled};});
 assert.deepEqual(state,{calls:1,text:'Atualizando painel...',busy:'true',disabled:true});
 await reply(p,result());assert.equal(await p.locator('#refreshButton').isEnabled(),true);assert.equal(await p.locator('#refreshButton').getAttribute('aria-busy'),null);assert.match(await p.locator('#portalMessage').textContent(),/Painel atualizado/);
}));
test('failure announces error and allows retry without stale success',()=>fixture(async p=>{
 await p.evaluate(()=>window.__workspaceTest.load(false));
 await p.evaluate(()=>window.__calls[0].failure(new Error('SYNTHETIC_FAILURE')));
 assert.equal(await p.locator('#refreshButton').isEnabled(),true);assert.match(await p.locator('#portalMessage').textContent(),/Não foi possível/);
 await p.evaluate(()=>window.__workspaceTest.load(false));assert.equal(await p.evaluate(()=>window.__calls.length),2);
 await reply(p,result(),1);assert.match(await p.locator('#portalMessage').textContent(),/Painel atualizado/);
}));
test('denied and expired responses cannot announce success',()=>fixture(async p=>{
 await p.evaluate(()=>window.__workspaceTest.load(false));await reply(p,{autenticado:true,autorizado:false});
 assert.match(await p.locator('#portalMessage').textContent(),/não possui autorização/);assert.equal(await p.locator('#dashboard').isVisible(),false);
 await p.evaluate(()=>window.__workspaceTest.load(false));await reply(p,{autenticado:false},1);
 assert.equal(await p.locator('#loginView').isVisible(),true);assert.match(await p.locator('#loginMessage').textContent(),/sessão expirou/);
}));
test('event change invalidates previous callback; only current event paints',()=>fixture(async p=>{
 await p.evaluate(()=>window.__workspaceTest.load(false));
 await p.evaluate(()=>{document.getElementById('eventSelect').value='B';window.__workspaceTest.change();});
 assert.equal(await p.evaluate(()=>window.__calls.length),2);
 await reply(p,result('Evento Beta'),1);await reply(p,result('Evento Alfa'),0);
 assert.equal(await p.locator('#eventName').textContent(),'Evento Beta');assert.equal(await p.locator('#refreshButton').isEnabled(),true);
}));
test('timeout removes busy state and late response is ignored',()=>fixture(async p=>{
 await p.clock.install();await p.evaluate(()=>window.__workspaceTest.load(false));await p.clock.fastForward(12001);
 assert.equal(await p.locator('#refreshButton').isEnabled(),true);assert.equal(await p.locator('#refreshButton').getAttribute('aria-busy'),null);assert.match(await p.locator('#portalMessage').textContent(),/demorando/);
 await reply(p,result());assert.match(await p.locator('#portalMessage').textContent(),/demorando/);
}));
