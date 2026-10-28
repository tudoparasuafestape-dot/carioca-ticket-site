'use strict';
// No server or backend: route fulfillment only, deny all unrecognized requests.
const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), evidence=path.resolve(root,'../evidence');
const jpg='/assets/eventos/herminho-tbt-20261107-a2f84c198ed5b283.jpg';
const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/event-cover-picker.css"><title>Capa — fixture isolada</title><style>body{font:16px Arial;padding:24px;background:#f4f4f4}button{padding:12px}</style><h1>Evento de demonstração</h1><button id="open" data-approved-event-cover="SYNTHETIC-EVENT">Escolher capa</button><script src="/assets/event-cover-picker.js"></script></html>';
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [390,1366]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(), blocked=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(route.request().method()!=='GET'){blocked.push(route.request().url());return route.abort();}
   if(u.origin==='http://127.0.0.1:4173' && u.pathname==='/')return route.fulfill({body:html,contentType:'text/html'});
   const localAsset=u.origin==='http://127.0.0.1:4173' && ['/assets/event-cover-picker.js','/assets/event-cover-picker.css'].includes(u.pathname);
   const officialImage=u.origin==='https://cariocaticket.com.br' && u.pathname===jpg;
   if(localAsset||officialImage)return route.fulfill({body:fs.readFileSync(path.join(root,u.pathname)),contentType:officialImage?'image/jpeg':u.pathname.endsWith('.css')?'text/css':'application/javascript'});
   blocked.push(route.request().url());return route.abort();
  });
  await page.addInitScript(({jpg})=>{
   window.calls=[];
   const data={ok:true,eventId:'SYNTHETIC-EVENT',eventName:'Aniversário de Herminho · prévia isolada',version:'a'.repeat(64),currentAssetId:'',assets:[{assetId:'synthetic-cover',name:'Arte oficial aprovada · 07 novembro',url:'https://cariocaticket.com.br'+jpg,sha256:'a2f84c198ed5b283d51252671f9da5111721b1b0fc73d7538977822b4437d51f'}]};
   function runner(success,failure){return new Proxy({},{get(_,name){if(name==='withSuccessHandler')return fn=>runner(fn,failure);if(name==='withFailureHandler')return fn=>runner(success,fn);return payload=>{window.calls.push({name,payload});if(name==='ctEventoCapaBibliotecaListarSeguraPROD')setTimeout(()=>success(structuredClone(data)),10);else if(name==='ctEventoCapaBibliotecaSalvarSeguraPROD')window.finishSave=()=>success({ok:true,eventId:data.eventId,assetId:payload.assetId,version:'b'.repeat(64)});else throw new Error('Unapproved RPC');};}});}
   window.google={script:{run:runner()}};
  },{jpg});
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open').click();
  await page.locator('#ctCoverAssets img').waitFor();await page.waitForFunction(()=>document.querySelector('#ctCoverAssets img').naturalWidth===900);
  assert(await page.locator('#ctCoverSave').isDisabled());
  await page.keyboard.press('Escape');assert(!(await page.locator('dialog').evaluate(e=>e.open)));assert(await page.locator('#open').evaluate(e=>e===document.activeElement));
  await page.locator('#open').click();await page.locator('#ctCoverAssets input').check();await page.locator('#ctCoverReason').fill('Aplicar arte aprovada para este evento');await page.waitForFunction(()=>!document.getElementById('ctCoverSave').disabled);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'document overflow');
  assert(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth),'dialog overflow');
  await page.screenshot({path:path.join(evidence,`cover-picker-${width}.png`),fullPage:true});
  await page.locator('#ctCoverSave').evaluate(e=>{e.click();e.click();});
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.name==='ctEventoCapaBibliotecaSalvarSeguraPROD').length),1);
  await page.keyboard.press('Escape');assert(await page.locator('dialog').evaluate(e=>e.open));assert(await page.locator('#ctCoverClose').isDisabled());
  await page.evaluate(()=>finishSave());await page.waitForFunction(()=>document.getElementById('ctCoverStatus').textContent.includes('Capa salva'));
  await page.locator('#ctCoverClose').click();assert(!(await page.locator('dialog').evaluate(e=>e.open)));
  assert.equal(blocked.length,0,'unexpected network request attempted');console.log(`PASS isolated browser ${width}: official local image, Escape/focus, image readiness, no overflow, save double-click, save cancellation guard, success/close; zero network pass-through.`);
  await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
