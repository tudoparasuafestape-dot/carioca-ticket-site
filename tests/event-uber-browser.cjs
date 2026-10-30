const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const server=require('./event-uber-preview-server.cjs');
const origin='http://127.0.0.1:42979',ID='EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const out='test-results/event-uber';fs.mkdirSync(out,{recursive:true});const report=[];
const event={id:ID,local:'Vevets Recepções',endereco:'Rua Arenópolis, 82 - Candeias',cidade:'Jaboatão dos Guararapes',uf:'PE'};
const expected={'pt-BR':'Ir de Uber','en-US':'Go with Uber',es:'Ir con Uber','zh-Hans':'乘坐 Uber'};
(async()=>{const browser=await chromium.launch(process.env.CT_CHROMIUM_PATH ? {executablePath:process.env.CT_CHROMIUM_PATH} : {});try{
 for(const route of ['evento','evento-v2'])for(const locale of Object.keys(expected)){
  const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block',permissions:[]});
  await context.addInitScript(locale=>{localStorage.setItem('ct-home-locale',locale);Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copied=value}}});},locale);
  let external=[],errors=[];
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin)return r.continue();if(['maps.google.com','www.google.com'].includes(u.hostname)&&['/maps','/maps/embed'].includes(u.pathname))return r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><p>Mapa simulado</p>'});external.push(u.origin);return r.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${origin}/${route}/?evento=${ID}`);await page.locator('#app').waitFor({state:'visible'});
  const link=page.locator('#directions-uber');await link.scrollIntoViewIfNeeded();assert(await link.isVisible());
  assert.equal(await page.locator('#directions-uber-label').textContent(),expected[locale]);
  const href=await link.getAttribute('href'),url=new URL(href),drop=JSON.parse(url.searchParams.get('drop[0]'));
  assert.equal(url.origin,'https://m.uber.com');assert.equal(url.pathname,'/looking');assert.equal(drop.latitude,-8.1932272);assert.equal(drop.longitude,-34.9293376);
  assert.equal(await link.getAttribute('target'),'_self');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
  assert.equal(await link.getAttribute('aria-describedby'),'directions-uber-note');
  await link.focus();assert.equal(await page.evaluate(()=>document.activeElement.id),'directions-uber');
  for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:1100});await page.selectOption('#home-theme',theme);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route}/${width}/${theme}`);
   const box=await link.boundingBox();assert(box.height>=44);
   await page.locator('#event-directions').screenshot({path:`${out}/${route}-${locale}-${width}-${theme}.png`});
  }
  await page.locator('#directions-copy').click();assert.equal(await page.evaluate(()=>copied),await page.locator('#directions-address').inputValue());
  assert.equal(await link.getAttribute('href'),href);
  for(const bad of [{...event,id:'OTHER'},{...event,endereco:'Rua Arenópolis, 83'},{...event,local:'Online'},{}]){
   await page.evaluate(({e,id})=>CTEventUber.render(e,id),{e:bad,id:ID});if(bad.id===ID && bad.local!=='Online'){assert(await link.isVisible());assert.equal(await link.getAttribute('href'),'https://m.uber.com/')}else{assert(await link.isHidden());assert.equal(await link.getAttribute('href'),null);}
  }
  await page.evaluate(({e,id})=>{CTEventDirections.render(e);CTEventUber.render(e,id);},{e:event,id:ID});assert(await link.isVisible());
  await page.evaluate(()=>CTEventUber.clear());await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert(await link.isHidden());
  assert.deepEqual(errors,[]);assert(!external.some(x=>x.includes('uber.com')));report.push({route,locale,passed:true,blockedExternal:[...new Set(external)]});await context.close();
 }
 for(const route of ['evento','evento-v2']){
  const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin)return r.continue();if(['maps.google.com','www.google.com'].includes(u.hostname))return r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><p>Mapa simulado</p>'});return r.abort();});
  const page=await context.newPage(),eraId='EVT-23112026-ERA-BEAUTY-EAC4B673';
  await page.goto(`${origin}/${route}/?evento=${eraId}&scenario=era`);await page.locator('#app').waitFor({state:'visible'});
  const link=page.locator('#directions-uber');assert(await link.isVisible());
  const drop=JSON.parse(new URL(await link.getAttribute('href')).searchParams.get('drop[0]'));
  assert.equal(drop.latitude,-8.0651289);assert.equal(drop.longitude,-34.9050337);assert.equal(drop.addressLine1,'Sebrae - Recife');
  assert.match(await page.locator('#directions-address').inputValue(),/Rua Tabajaras, 360 - Ilha do Retiro/);
  for(const width of [320,390,1440])for(const theme of ['light','dark']){await page.setViewportSize({width,height:1100});await page.selectOption('#home-theme',theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#event-directions').screenshot({path:`${out}/${route}-era-${width}-${theme}.png`});}
  report.push({route,event:'ERA',passed:true,destination:drop});await context.close();
 }
 for(const scenario of ['unknown','changed','old-fixture']){
  const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();
  await page.goto(`${origin}/evento/?evento=${ID}&scenario=${scenario}`);await page.locator('#app').waitFor({state:'visible'});if(scenario==='unknown'){assert(await page.locator('#directions-uber').isHidden());assert.equal(await page.locator('#directions-uber').getAttribute('href'),null)}else{assert(await page.locator('#directions-uber').isVisible());assert.equal(await page.locator('#directions-uber').getAttribute('href'),'https://m.uber.com/')}await context.close();
 }
 for(const route of ['evento','evento-v2']){
  const context=await browser.newContext({serviceWorkers:'block',permissions:[]});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();
  await page.goto(`${origin}/${route}/?evento=${ID}`);await page.locator('#app').waitFor({state:'visible'});
  assert(await page.locator('#directions-uber').isVisible());
  // Hold only the local fixture response. Exercise the actual load, message
  // handler and showError; never replace any product cleanup implementation.
  await page.evaluate(()=>{
   HTMLFormElement.prototype.submit=function(){
    const fields=new FormData(this);
    if(fields.get('ctMinhaCariocaAction')!=='publicRpc'||fields.get('metodo')!=='ctEventoPublicoCarregarPROD')throw Error('Unexpected synthetic request');
    window.heldPublicRead=fields.get('ctMinhaCariocaRequestId');
   };
   document.getElementById('retryEventLoad').click();
  });
  assert.equal(await page.locator('#directions-uber').getAttribute('href'),null,'load clears old destination');
  // Deliberately seed a stale destination while the request is pending to
  // prove error cleanup independently of the cleanup at the start of load.
  await page.evaluate(({event,ID})=>{CTEventDirections.render(event);CTEventUber.render(event,ID);},{event,ID});
  assert(await page.locator('#directions-uber').getAttribute('href'));
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{
   origin:'https://script.google.com',data:{ctMinhaCariocaPost:true,id:window.heldPublicRead,ok:false,erro:'SYNTHETIC_PRIVATE_ERROR'}
  })));
  await page.locator('#errorBox').waitFor({state:'visible'});
  assert.equal(await page.locator('#errorReferenceCode').textContent(),'E02');
  assert.doesNotMatch(await page.locator('#errorBox').textContent(),/SYNTHETIC_PRIVATE_ERROR/);
  for(const id of ['directions-uber','directions-waze'])assert.equal(await page.locator('#'+id).getAttribute('href'),null,'showError removes destination href');
  await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));document.dispatchEvent(new Event('ct:public-language'));});
  for(const id of ['directions-uber','directions-waze']){
   assert(await page.locator('#'+id).isHidden());assert.equal(await page.locator('#'+id).getAttribute('href'),null,'stale destination cannot revive');
  }
  report.push({route,scenario:'actual-error-handler-clears-stale-destinations',passed:true});await context.close();
 }
 console.log('PASS: Uber controls on both templates, 4 languages, 4 widths, light/dark, copy preservation, focus, unknown/changed payloads, actual error-handler cleanup, zero Uber requests');
}finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
