'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,expect}=require('@playwright/test');
const {installIsolatedNetwork}=require('./safety/isolated-network.cjs');
const {createFixtures,EVENT}=require('./fixtures/public-canary.cjs');
const origin='http://127.0.0.1:4173',root=path.resolve(__dirname,'..'),reports=[];
const screenshotDir=path.join(root,'test-results/privacy');fs.mkdirSync(screenshotDir,{recursive:true});
const key='ct-public-privacy-v1';
async function main(){
const browser=await chromium.launch({headless:true,...(process.env.CT_CHROMIUM_PATH?{executablePath:process.env.CT_CHROMIUM_PATH}:{}),proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'},args:['--no-sandbox','--disable-background-networking','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
async function setup({width=390,choice,denied=false,locale='pt-BR',theme='dark',font=100}={}){
 const context=await browser.newContext({offline:true,serviceWorkers:'block',viewport:{width,height:900}});
 await context.addInitScript(({choice,key,denied,locale,theme,font})=>{if(denied){Object.defineProperty(window,'localStorage',{get(){throw Error('Storage blocked')}});}else{if(choice)localStorage.setItem(key,JSON.stringify(choice));localStorage.setItem('ct-home-locale',locale);localStorage.setItem('ct-home-theme',theme);localStorage.setItem('ct-home-font',String(font));}}, {choice,key,denied,locale,theme,font});
 const fixtures=createFixtures(),cat=fixtures.handlers['publicRpc:ctEventoPublicoCarregarPROD'];
 fixtures.handlers['publicRpc:ctEventoPublicoCarregarPROD']=(args,state)=>{const v=cat(args,state);v.evento.endereco='Rua de Teste, 42';return v;};
 const maps=[];const destination='LOCAL SINTETICO, Rua de Teste, 42, Recife, PE, Brasil';
 fixtures.resources['https://maps.google.com/maps?output=embed&q='+encodeURIComponent(destination)]={contentType:'text/html',body:'<!doctype html><p>Mapa simulado localmente</p>'};
 const guard=await installIsolatedNetwork(context,{root,origin,...fixtures});
 // Explicit image fixtures only for oversized decorative images, not scripts or APIs.
 await context.route('**/assets/home-ad-*.png',route=>route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'assets/carioca-ticket-logo.png'))}));
 context.on('request',req=>{if(new URL(req.url()).hostname==='maps.google.com')maps.push(req.url());});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 return {context,page,guard,maps,errors,async close(label){await context.close();guard.assertClean();assert.deepEqual(errors,[],label+' JS errors');reports.push({label,status:'passed',forwarded:guard.state.forwarded,telemetry:guard.state.telemetry.length,maps:maps.length});console.log('PASS '+label);}};
}
try{
for(const route of ['/','/evento/','/checkout/']){
 const t=await setup();await t.page.goto(origin+route+'?evento='+EVENT+'&src=CANARIO');await t.page.waitForTimeout(4200);
 assert.equal(t.guard.state.telemetry.length,0);assert.equal(await t.page.evaluate(()=>sessionStorage.getItem('CT_ANALYTICS_SESSION_V1')),null);
 await expect(t.page.locator('#ct-privacy-banner')).toBeVisible();
 assert.equal(await t.page.locator('#ct-privacy-banner').evaluate(e=>getComputedStyle(e).position),'fixed');
 await expect(t.page.locator('#ct-privacy-dialog')).not.toBeVisible();
 if(route==='/evento/'){await t.page.locator('#buyMobile').click({trial:true});assert(await t.page.locator('#buyMobile').evaluate(e=>{const b=document.getElementById('ct-privacy-banner').getBoundingClientRect(),a=e.getBoundingClientRect();return b.bottom<=a.top||b.top>=a.bottom||b.right<=a.left||b.left>=a.right;}));}
 if(route==='/checkout/'){await t.page.locator('#buyerName').fill('Comprador sintético');await t.page.locator('#quantity').fill('2');assert.equal(await t.page.locator('#buyerName').inputValue(),'Comprador sintético');}
 await t.page.getByRole('button',{name:'Continuar sem estas opções',exact:true}).click();await expect(t.page.locator('main')).toBeFocused();assert(await t.page.locator('main').evaluate(e=>{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}));await t.page.waitForTimeout(2800);
 assert.equal(t.guard.state.telemetry.length,0);assert.equal(await t.page.evaluate(()=>CTPrivacy.allowed('analytics')),false);
 await t.page.locator('#ct-privacy-reopen').click();await t.page.locator('#ct-privacy-analytics').check();await t.page.getByRole('button',{name:'Salvar escolhas',exact:true}).click();
 await expect.poll(()=>t.guard.state.telemetry.length,{timeout:10000}).toBe(1);
 await t.page.locator('#ct-privacy-reopen').click();await t.page.locator('#ct-privacy-analytics').uncheck();await t.page.getByRole('button',{name:'Salvar escolhas',exact:true}).click();
 assert.equal(await t.page.evaluate(()=>sessionStorage.getItem('CT_ANALYTICS_SESSION_V1')),null);
 await t.close('metrics default/reject/opt-in/revoke '+route);
}
for(const route of ['/evento/','/evento-v2/']){
 const t=await setup();await t.page.goto(origin+route+'?evento='+EVENT);
 await t.page.getByRole('button',{name:'Continuar sem estas opções',exact:true}).click();
 const host=t.page.locator('#directions-map-preview');await host.scrollIntoViewIfNeeded();await t.page.waitForTimeout(200);
 assert.equal(t.maps.length,0);assert.equal(await host.locator('iframe').count(),0);
 await host.getByRole('button',{name:'Carregar este mapa uma vez'}).click();await expect.poll(()=>t.maps.length).toBe(1);await expect(host.locator('iframe')).toBeVisible();
 assert.equal(await t.page.evaluate(()=>CTPrivacy.allowed('maps')),false);
 await t.page.locator('#ct-privacy-reopen').click();await t.page.getByRole('button',{name:'Salvar escolhas',exact:true}).click();assert.equal(await host.locator('iframe').count(),0);
 await t.page.locator('#ct-privacy-reopen').click();await t.page.locator('#ct-privacy-maps').check();await t.page.getByRole('button',{name:'Salvar escolhas',exact:true}).click();
 await host.scrollIntoViewIfNeeded();await expect.poll(()=>t.maps.length).toBe(2);
 const before=await t.page.locator('#directions-map').getAttribute('href');assert(before.includes('/maps/dir/'));assert.equal(await host.locator('iframe').getAttribute('referrerpolicy'),'no-referrer');
 await t.page.locator('#ct-privacy-reopen').click();await t.page.locator('#ct-privacy-maps').uncheck();await t.page.getByRole('button',{name:'Salvar escolhas',exact:true}).click();assert.equal(await host.locator('iframe').count(),0);assert.equal(await t.page.locator('#directions-map').getAttribute('href'),before);
 await t.close('map explicit/once/revoke '+route);
}
for(const route of ['/','/evento/'])for(const width of [320,1440])for(const locale of ['pt-BR','en-US','es','zh-Hans'])for(const theme of ['light','dark'])for(const font of [100,150]){
 const t=await setup({width,locale,theme,font});await t.page.goto(origin+route+'?evento='+EVENT);if(route==='/evento/')await expect(t.page.locator('#app')).toBeVisible();const surface=route==='/'?'home':'event';await expect(t.page.locator('#ct-privacy-banner')).toBeVisible();
 assert(await t.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(route==='/evento/'&&width===320){await t.page.locator('#buyMobile').click({trial:true});assert(await t.page.locator('#buyMobile').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.getElementById('ct-privacy-banner').getBoundingClientRect();return b.bottom<=a.top||b.top>=a.bottom;}));}
 await t.page.screenshot({path:path.join(screenshotDir,`page-${surface}-${width}-${locale}-${theme}-${font}.png`)});
 await t.page.locator('#ct-privacy-banner').screenshot({path:path.join(screenshotDir,`banner-${surface}-${width}-${locale}-${theme}-${font}.png`)});
 await t.page.locator('#ct-privacy-banner button').last().click();await expect(t.page.locator('#ct-privacy-dialog')).toBeVisible();
 assert.equal(await t.page.locator('#ct-privacy-dialog').getAttribute('lang'),locale);assert(await t.page.locator('#ct-privacy-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await t.page.locator('#ct-privacy-dialog').screenshot({path:path.join(screenshotDir,`dialog-${surface}-${width}-${locale}-${theme}-${font}.png`)});
 await t.page.keyboard.press('Escape');await expect(t.page.locator('#ct-privacy-dialog')).not.toBeVisible();await expect(t.page.locator('#ct-privacy-banner button').last()).toBeFocused();
 await t.close('layout/focus '+surface+' '+width+' '+locale+' '+theme+' '+font);
}
{
 const t=await setup({denied:true});await t.page.goto(origin+'/');await t.page.getByRole('button',{name:'Ver detalhes e escolher'}).click();await t.page.locator('#ct-privacy-analytics').check();await t.page.getByRole('button',{name:'Salvar escolhas',exact:true}).click();await expect(t.page.locator('#ct-privacy-dialog [role=status]')).toBeVisible();await expect.poll(()=>t.guard.state.telemetry.length,{timeout:10000}).toBe(1);await t.close('storage denied memory-only');
}
}finally{await browser.close();fs.writeFileSync(path.join(screenshotDir,'report.json'),JSON.stringify(reports,null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
