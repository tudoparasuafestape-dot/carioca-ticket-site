const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.CT_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=process.cwd();
 const server=http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'image/png');res.end(b);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CT_CHROMIUM_PATH?{executablePath:process.env.CT_CHROMIUM_PATH}:{})});
 let count=0;
 try{
 const context=await browser.newContext();
 const page=await context.newPage();const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{if(!route.request().url().startsWith(origin)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(origin+'/como-funciona/');
 for(const locale of ['pt-BR','en-US','es','zh-Hans']){
  await page.selectOption('#guide-language',locale);assert.equal(await page.locator('html').getAttribute('lang'),locale);
  for(const width of [320,375,768,1024,1440]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),locale+' '+width+' overflow');
   for(const text of await page.locator('[data-guide]').allTextContents())assert(text.trim());
   await page.locator('details summary').first().focus();await page.keyboard.press('Enter');assert(await page.locator('details').first().getAttribute('open')!==null);await page.keyboard.press('Enter');
   count++;
  }
 }
 await page.selectOption('#guide-language','en-US');await page.selectOption('#home-theme','dark');for(let i=0;i<5;i++)await page.click('#font-up');
 await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'en-US');assert.equal(await page.locator('html').getAttribute('data-home-theme'),'dark');assert.equal(await page.locator('#font-reset').textContent(),'150%');
 for(const locale of ['pt-BR','en-US','es','zh-Hans']){await page.selectOption('#guide-language',locale);await page.setViewportSize({width:320,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'150% '+locale);}
 await page.click('#font-reset');await page.selectOption('#home-theme','light');await page.selectOption('#guide-language','pt-BR');await page.reload();await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Pular para o conteúdo');await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'conteudo');
 assert.equal(await page.locator('[data-commercial]').getAttribute('target'),'_blank');assert((await page.locator('[data-commercial]').getAttribute('href')).startsWith('https://wa.me/5581999311509?text='));
 assert.equal(await page.locator('form').count(),0);
 fs.mkdirSync('test-results/producer-guide',{recursive:true});
 for(const [width,locale,theme] of [[320,'pt-BR','light'],[1440,'pt-BR','light'],[375,'zh-Hans','dark'],[1440,'en-US','dark']]){await page.setViewportSize({width,height:900});await page.selectOption('#guide-language',locale);await page.selectOption('#home-theme',theme);await page.screenshot({path:`test-results/producer-guide/${width}-${locale}-${theme}.png`,fullPage:true});}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await context.close();
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:900}});const fallback=await nojs.newPage();await fallback.goto(origin+'/como-funciona/');assert.equal(await fallback.locator('h1').textContent(),'Seu evento, passo a passo.');assert(await fallback.locator('.preferences').isHidden());assert(await fallback.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await fallback.locator('summary').first().click();assert(await fallback.locator('details').first().getAttribute('open')!==null);assert.equal(await fallback.locator('a[href="/produtor/solicitar/"]').count(),1);await nojs.close();
 const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage unavailable')}})});const bp=await blocked.newPage();await bp.goto(origin+'/como-funciona/');await bp.selectOption('#guide-language','es');assert.equal(await bp.locator('html').getAttribute('lang'),'es');await blocked.close();
 console.log(JSON.stringify({status:'passed',responsiveLocaleCases:count,extraChecks:['150% font at 320 in all languages','persistent preferences','keyboard skip and FAQ','no JavaScript','storage denied','safe WhatsApp links','no external requests'],screenshots:4},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
