'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const fixtureMode=process.env.CT_INVITE_BACKEND_MODE==='fixture';
const {harness}=fixtureMode?require('./fixtures/courtesy-invites-backend.cjs'):require(path.resolve(process.env.CT_INVITE_BACKEND||'../carioca-ticket','tests/courtesy_invites_runtime.js'));
console.log('Backend validation mode: '+(fixtureMode?'UI contract fixture only':'REAL backend modules + in-memory Sheets'));
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:4173';
const endpoints=new Set(['https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec','https://script.google.com/macros/s/AKfycbyhx6mnGJMsgpGmx-C1r6ZUXbrE66-X6Rkusp1ulVOGcDfJfIs-jgysWp1PfkqB1UC3hg/exec']);
const publicMethods=new Set(['ctCortesiaConviteCarregarPublicoPROD','ctCortesiaConviteCadastrarPublicoPROD','ctCortesiaConviteRecuperarPublicoPROD']);
const portalMethods=new Set(['ctCortesiasCarregarPROD','ctCortesiaConviteCriarPROD','ctCortesiaConviteRevogarPROD','ctCortesiaConvitesListarPROD']);
async function fixture(browser,viewport,sharedHarness){
 const h=sharedHarness||harness(),unexpected=[],calls=[],errors=[];let loseNext=false;
 const context=await browser.newContext({viewport,offline:true,serviceWorkers:'block'});
 await context.routeWebSocket('**/*',s=>{unexpected.push('websocket');s.close()});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===origin&&req.method()==='GET'){
   let p=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(root+path.sep)&&p!==root){unexpected.push('path');return route.abort()}
   if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');
   if(!fs.existsSync(p)){unexpected.push('missing-static');return route.abort()}
   const mime={'.html':'text/html','.js':'application/javascript','.png':'image/png','.css':'text/css'}[path.extname(p)]||'application/octet-stream';
   return route.fulfill({status:200,contentType:mime+'; charset=utf-8',body:fs.readFileSync(p)});
  }
  if(!endpoints.has(req.url())||req.method()!=='POST'){unexpected.push({host:u.hostname,verb:req.method()});return route.abort()}
  const body=new URLSearchParams(req.postData()),method=body.get('metodo'),action=body.get('ctMinhaCariocaAction'),args=JSON.parse(body.get('argsJson'));
  const id=body.get('ctMinhaCariocaRequestId');let result,err;
  calls.push({action,method});
  try{
   if(action==='publicRpc'&&publicMethods.has(method))result=h.ctx.ctPublicoFirstPartyRpcPROD_(method,JSON.stringify(args));
   else if(action==='portalRpc'&&portalMethods.has(method))result=h.ctx.ctPortalProdutorRpcPROD_(method,JSON.stringify(args));
   else if(action==='portalRpc'&&method==='ctPortalProdutorRestaurarSessaoIsoladaPROD')result={sucesso:true,autenticado:true,autorizado:true,usuario:{perfil:'PRODUTOR_TITULAR'},produtores:[{id:'PROD-SYNTH',nome:'Produtor sintético',perfil:'PRODUTOR_TITULAR'}]};
   else if(action==='portalRpc'&&method==='ctPortalProdutorCarregarCatalogoEventosPROD')result={sucesso:true,autenticado:true,autorizado:true,produtorId:'PROD-SYNTH',eventos:[h.event]};
   else {unexpected.push('RPC:'+method);throw Error('UNEXPECTED_RPC')}
   if(loseNext&&method==='ctCortesiaConviteCadastrarPublicoPROD'){loseNext=false;throw Error('SYNTHETIC_RESPONSE_LOST')}
  }catch(e){err=e.message}
  const envelope=JSON.stringify({ctMinhaCariocaPost:true,id,ok:!err,resultado:result,erro:err}).replace(/</g,'\\u003c');
  return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+envelope+',"*")</script>'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 return {h,context,page,calls,lose:()=>loseNext=true,async close(){assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);await context.close()}};
}
async function wait(page,selector){await page.locator(selector).first().waitFor({state:'visible'});}
async function fill(page,name,last='Sintética',phone='81999990001'){
 await page.locator('#firstName').fill(name);await page.locator('#lastName').fill(last);await page.locator('#phone').fill(phone);await page.locator('#submit').click();
}
async function visible(page,id){return page.locator(id).isVisible()}
(async()=>{
const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'},args:['--disable-background-networking','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
try{for(const viewport of [{width:1365,height:900},{width:390,height:844},{width:320,height:740}]){
 const f=await fixture(browser,viewport),{page,h}=f;
 await page.addInitScript(()=>{sessionStorage.setItem('CT_PORTAL_PRODUTOR_PROD_SESSION_V1',JSON.stringify({token:'SESSION-SYNTH',expiraEm:'2099-01-01T00:00:00Z'}));Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text}},configurable:true});});
 await page.goto(origin+'/produtor/cortesias/');await wait(page,'#content');await page.locator('#createInvite').click();
 await wait(page,'[data-invite-id]');assert.equal(h.sheets.get('CT_CORTESIA_CONVITES').getLastRow(),2);
 const link=await page.locator('#inviteList input').inputValue();assert.match(link,/^https:\/\/cariocaticket\.com\.br\/cortesia\/convite\/#[a-f0-9]{64}$/);
 await page.locator('[data-invite-copy]').click();assert.equal(await page.evaluate(()=>window.copied),link);
 assert.equal(h.tickets.getLastRow(),1,'creating invitation must not issue');
 assert(await page.locator('#inviteList').textContent().then(t=>t.includes('3 reservadas · 0 emitidas · 3 disponíveis · 0 entradas')));
 const publicUrl=origin+'/cortesia/convite/#'+link.split('#')[1];await page.goto(publicUrl);await wait(page,'#registration');
 const second=await f.context.newPage();await second.goto(publicUrl);await wait(second,'#registration');
 assert.equal(await page.locator('#available').textContent(),'3');
 f.lose();await fill(page,'João',"D’Ávila");await wait(page,'#retryNote');assert.equal(h.tickets.getLastRow(),2);
 await page.reload();await wait(page,'#retryNote');assert.equal(await page.locator('#firstName').inputValue(),'João');
 await page.locator('#submit').click();await wait(page,'.ticket');assert.equal(h.tickets.getLastRow(),2,'retry after lost response issued twice');
 assert.equal(await page.locator('#available').textContent(),'2');
 await fill(second,'Maria','dos Santos','81999990002');await wait(second,'.ticket');
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ticket').length===2);
 assert.equal(await page.locator('#available').textContent(),'1');
 const other=await fixture(browser,viewport,h);await other.page.goto(publicUrl);await wait(other.page,'#registration');
 assert.equal(await visible(other.page,'#tickets'),false,'another recipient can see prior guests');
 assert.equal(await other.page.locator('#available').textContent(),'1');await other.close();
 // A second tab shares receipts but has an independent pending attempt; no phone list in public API.
 await second.reload();await wait(second,'#registration');
 await fill(second,'Ana','Silva','81999990003');await wait(second,'.ticket');
 await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('available').textContent==='0');
 assert.equal(h.tickets.getLastRow(),4);assert.equal(new Set(h.tickets.rows.slice(1).map(r=>r[4])).size,3);
 assert.equal(await visible(page,'#registration'),false);
 const shared=await second.locator('.ticket .actions a').last().getAttribute('href');assert.match(shared,/^https:\/\/wa.me\/\?text=/);assert(!shared.includes('phone='));
 const publicData=h.ctx.ctCortesiaConviteCarregarPublicoPROD(link.split('#')[1]);assert(!JSON.stringify(publicData).includes('João'));assert(!JSON.stringify(publicData).includes('8199999'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow');
 fs.mkdirSync(path.join(root,'test-results/courtesy-invites'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/courtesy-invites/public-'+viewport.width+'.png'),fullPage:true});
 await page.goto(origin+'/produtor/cortesias/');await wait(page,'#content');await page.screenshot({path:path.join(root,'test-results/courtesy-invites/producer-'+viewport.width+'.png'),fullPage:true});
 await f.close();console.log('PASS integrated producer/public, retry/reload/partial/multiple tabs/quantity/share/privacy '+viewport.width);
}
const future=await fixture(browser,{width:390,height:844});
await future.page.addInitScript(()=>sessionStorage.setItem('CT_PORTAL_PRODUTOR_PROD_SESSION_V1',JSON.stringify({token:'SESSION-SYNTH',expiraEm:'2099-01-01T00:00:00Z'})));
future.h.lot.dentroDoPeriodo=false;await future.page.goto(origin+'/produtor/cortesias/');await wait(future.page,'#content');await future.page.locator('#createInvite').click();
await future.page.waitForFunction(()=>document.getElementById('message').textContent.includes('lote escolhido não está disponível'));
assert.equal(await future.page.locator('#inviteLot').isEnabled(),true);assert.equal(future.h.sheets.has('CT_CORTESIA_CONVITES'),false);
future.h.lot.dentroDoPeriodo=true;await future.page.locator('#createInvite').click();await wait(future.page,'[data-invite-id]');await future.close();console.log('PASS future lot can be corrected without stuck pending creation');
for(const mode of ['revoked','expired','private','invalid-name','invalid-phone','missing-token']){
 const f=await fixture(browser,{width:390,height:844}),i=f.h.create(),url=origin+'/cortesia/convite/#'+i.link.split('#')[1];
 if(mode==='revoked')f.h.ctx.ctCortesiaConviteRevogarPROD('SESSION-SYNTH',f.h.event.id,i.convite.conviteId);
 if(mode==='expired')f.h.state.now=Date.parse(i.convite.expiraEm);
 await f.page.goto(mode==='missing-token'?origin+'/cortesia/convite/':url);
 if(['revoked','expired'].includes(mode)){await wait(f.page,'#summary');assert.equal(await visible(f.page,'#registration'),false)}
 else if(mode==='missing-token'){assert((await f.page.locator('#message').textContent()).includes('incompleto'))}
 else {await wait(f.page,'#registration');if(mode==='private')f.h.state.private=true;await fill(f.page,mode==='invalid-name'?'=INVALID':'Pessoa','Teste',mode==='invalid-phone'?'123':'81999990004');await f.page.waitForFunction(()=>document.querySelector('#message').classList.contains('error'));assert.equal(f.h.tickets.getLastRow(),1);}
 await f.close();console.log('PASS error state '+mode);
}
}finally{await browser.close()}
console.log('PASS all browser requests fulfilled locally or denied; zero forwarded requests.');
})().catch(e=>{console.error(e);process.exitCode=1});
