const {chromium}=require('@playwright/test'),fs=require('node:fs'),assert=require('node:assert/strict');
const server=require('./event-destination-preview.cjs'),origin='http://127.0.0.1:42981',out='test-results/event-destination';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});let external=[];
 await context.addInitScript(()=>sessionStorage.setItem('CT_PORTAL_PRODUTOR_PROD_SESSION_V1',JSON.stringify({token:'SYNTHETIC',expiraEm:'2099-01-01T00:00:00Z'})));
 await context.route('**/*',r=>{
  const u=new URL(r.request().url());if(u.origin===origin)return r.continue();
  if(['fixture.invalid','fixture.googleusercontent.com'].includes(u.hostname)&&u.pathname==='/reply'){
    const data=JSON.parse(u.searchParams.get('payload'));
    const forged={...data,ok:false,erro:'FORGED_RESPONSE'};
    const script=u.hostname==='fixture.invalid'?'window.top.postMessage('+JSON.stringify(forged)+',"*")':
      'window.top.postMessage('+JSON.stringify({...forged,id:'WRONG-NONCE'})+',"*");setTimeout(()=>{window.top.postMessage('+JSON.stringify(data)+',"*");setTimeout(()=>window.top.postMessage('+JSON.stringify(forged)+',"*"),10)},40)';
    return r.fulfill({status:200,contentType:'text/html',body:'<script>'+script+'</script>'});
  }
  external.push(r.request().url());return r.abort();
 });const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin+'/produtor/destino/?evento=EVT-TEST-A');await page.locator('#editor').waitFor({state:'visible'});
 await page.fill('#latitude','-8,1');await page.fill('#longitude','-35.2');assert(await page.locator('#pin-map').isVisible());await page.check('#confirmed');
 await page.fill('#latitude','-8.2');assert.equal(await page.isChecked('#confirmed'),false);await page.check('#confirmed');await page.click('#save');await page.getByText('Destino salvo.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>fixtureCalls.filter(x=>x.method==='ctEventoDestinoSalvarPROD').length),1);
 await page.click('#reload');await page.getByText('Destino confirmado.',{exact:false}).waitFor();assert.equal(await page.inputValue('#latitude'),'-8.2');assert.equal(await page.isChecked('#confirmed'),false);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/editor-'+width+'.png',fullPage:true});}
 page.on('dialog',d=>d.accept());await page.click('#revoke');await page.getByText('Destino desativado.',{exact:false}).waitFor();await page.click('#reload');await page.getByText('Este evento ainda precisa',{exact:false}).waitFor();assert.equal(await page.inputValue('#latitude'),'');
 await page.goto(origin+'/produtor/destino/?evento=EVT-TEST-B');await page.locator('#editor').waitFor({state:'visible'});assert.equal(await page.inputValue('#latitude'),'');
 await page.goto(origin+'/produtor/destino/?evento=EVT-TEST-B&scenario=conflict');await page.locator('#editor').waitFor({state:'visible'});await page.fill('#latitude','-7');await page.fill('#longitude','-34');await page.check('#confirmed');await page.click('#save');await page.getByText('Outra alteração foi salva.',{exact:false}).waitFor();assert(await page.locator('#save').isDisabled());await page.click('#reload');await page.getByText('Este evento ainda precisa',{exact:false}).waitFor();assert(!(await page.locator('#save').isDisabled()));
 await page.goto(origin+'/produtor/destino/?evento=EVT-TEST-B&scenario=denied');await page.getByText('Sua conta não pode',{exact:false}).waitFor();assert(await page.locator('#editor').isHidden());
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await context.close();
 const missing=await browser.newContext();await missing.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const p=await missing.newPage();await p.goto(origin+'/produtor/destino/?evento=EVT-TEST-A');await p.locator('#login').waitFor({state:'visible'});assert(await p.locator('#editor').isHidden());await missing.close();
 console.log('PASS: editor save/reload/revoke, distinct events, changed pin unchecks confirmation, conflict/retry, denied/absent session, mobile/desktop, real nested iframe replies, rejected origin/nonce/replay and no external requests');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
