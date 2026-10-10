const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');const fs=require('node:fs');
const server=require('./event-map-preview-server.cjs');
const origin='http://127.0.0.1:42978',out='test-results/event-map-integration';fs.mkdirSync(out,{recursive:true});
const cases=[],locales=['pt-BR','en-US','es','zh-Hans'];
const words={'pt-BR':'Mapa fornecido pelo Google','en-US':'Map provided by Google',es:'Mapa proporcionado por Google','zh-Hans':'地图由 Google 提供'};
(async()=>{const browser=await chromium.launch();try{
for(const routeName of ['evento','evento-v2'])for(const locale of locales){
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block',permissions:[]});
 await context.addInitScript(l=>{localStorage.setItem('ct-home-locale',l);Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copied=value;}}});},locale);
 let provider=[],blocked=[],errors=[];
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin)return r.continue();if(u.hostname==='maps.google.com'&&u.pathname==='/maps'){provider.push(u);return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><p>Mapa fictício: apenas teste de interface</p>'});}blocked.push(u.origin);return r.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin+'/'+routeName+'/?evento=PREVIEW-EVENT');await page.locator('#app').waitFor({state:'visible'});
 const map=page.locator('#directions-map-preview');assert.equal(await map.getAttribute('lang'),locale);
 assert.equal(await map.locator('iframe').count(),0);assert.equal(provider.length,0);
 const before=await page.locator('#directions-map').getAttribute('href');
 await map.scrollIntoViewIfNeeded();await map.locator('iframe').waitFor();
 await page.waitForFunction(()=>document.querySelector('#directions-map-preview [role=status]').textContent.indexOf('…')===-1);
 assert((await map.innerText()).includes(words[locale]));
 assert.equal(new URL(provider[0]).searchParams.get('q'),await page.locator('#directions-address').inputValue());
 assert.equal(await map.locator('iframe').getAttribute('referrerpolicy'),'no-referrer');
 assert.match(await map.locator('iframe').getAttribute('allow'),/geolocation 'none'/);
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.selectOption('#home-theme',theme);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${routeName}/${locale}/${width}/${theme} overflow`);
  await page.locator('#event-directions').screenshot({path:`${out}/${routeName}-${locale}-${width}-${theme}.png`});
 }
 await page.locator('#directions-copy').click();assert.equal(await page.evaluate(()=>copied),await page.locator('#directions-address').inputValue());assert.equal(await page.locator('#directions-map').getAttribute('href'),before);
 await page.evaluate(()=>{localStorage.setItem('ct-home-locale','es');dispatchEvent(new StorageEvent('storage',{key:'ct-home-locale'}));});assert.equal(await map.getAttribute('lang'),'es');
 await page.evaluate(()=>{localStorage.setItem('ct-home-locale','en-US');dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});assert.equal(await map.getAttribute('lang'),'en-US');
 await page.evaluate(()=>{window.CTPublicI18n={getLocale:()=> 'zh-Hans'};document.dispatchEvent(new CustomEvent('ct:public-language'));});assert.equal(await map.getAttribute('lang'),'zh-Hans');
 await page.evaluate(()=>{delete window.CTPublicI18n;localStorage.setItem('ct-home-locale','invalid');dispatchEvent(new StorageEvent('storage',{key:'ct-home-locale'}));});assert.equal(await map.getAttribute('lang'),'pt-BR');
 await page.evaluate(()=>{CTEventDirections.render({local:'Outro espaço',endereco:'Avenida Nova, 42',cidade:'Olinda',uf:'PE'});CTEventMapPreview.renderPublicDirections();});
 await map.scrollIntoViewIfNeeded();await map.locator('iframe').waitFor();assert.equal(new URL(await map.locator('iframe').getAttribute('src')).searchParams.get('q'),'Outro espaço, Avenida Nova, 42, Olinda, PE, Brasil');
 for(const e of [{},{local:'Online',endereco:'Rua de teste, 123',cidade:'Recife',uf:'PE'},{local:'Espaço',endereco:'A confirmar',cidade:'Recife',uf:'PE'}]){
  await page.evaluate(e=>{CTEventDirections.render(e);CTEventMapPreview.renderPublicDirections();},e);assert(await map.isHidden());assert.equal(await map.locator('iframe').count(),0);
 }
 assert.deepEqual(errors,[]);cases.push({route:routeName,locale,status:'passed',providerQueries:provider.length,blockedOrigins:[...new Set(blocked)]});await context.close();
}
// Map text remains usable when local storage is denied; host only, not page language.
const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('disabled')}}));const page=await context.newPage();await page.goto(origin+'/evento/?evento=PREVIEW-EVENT');await page.locator('#app').waitFor({state:'visible'});assert.equal(await page.locator('#directions-map-preview').getAttribute('lang'),'pt-BR');await context.close();
}finally{fs.writeFileSync(out+'/report.json',JSON.stringify(cases,null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
