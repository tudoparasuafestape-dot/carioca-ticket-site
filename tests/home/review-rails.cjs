// Optional local review captures. This script never forwards off-origin requests.
const {chromium}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs');
const {capture}=require('./capture.cjs');
const origin='http://127.0.0.1:4178';
const evidence=path.resolve(__dirname,'../../docs/reviews/home-rails/screenshots');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const report=[];
 try {
  for(const width of [320,412,1440]) for(const colorScheme of ['light','dark']) {
   const context=await browser.newContext({viewport:{width,height:1000},colorScheme,serviceWorkers:'block'});
   await context.addInitScript(()=>{Math.random=()=>0;});
   const page=await context.newPage(),blocked=[],errors=[];
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blocked.push(route.request().method());return route.abort();} return route.continue();});
   await context.routeWebSocket('**/*',socket=>socket.close());
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/?count=15'); await page.locator('.catalog-card').nth(14).waitFor({state:'attached'});
   await page.locator('#event-rail-pause').click(); await page.mouse.click(2,2); await page.evaluate(()=>scrollTo(0,0));
   await capture(page,path.join(evidence,`preview-${colorScheme}-${width}.png`));
   await capture(page,path.join(evidence,`preview-${colorScheme}-${width}-full.png`),true);
   if(width!==320) for(const slot of ['primary','secondary']) {
    const ad=page.locator('#advertising-'+slot); await ad.scrollIntoViewIfNeeded();
    if(await ad.locator('.ad-campaign').isHidden())await ad.getByRole('button',{name:'Próxima publicidade'}).click();
    await ad.screenshot({path:path.join(evidence,`ad-${slot}-${colorScheme}-${width}.png`)});
   }
   report.push({width,colorScheme,blocked,errors}); await context.close();
  }
 } finally {await browser.close();}
 fs.writeFileSync(path.join(evidence,'capture-audit.json'),JSON.stringify(report,null,2));
 if(report.some(r=>r.blocked.length||r.errors.length))throw new Error('Review capture had blocked/unexpected requests or page errors');
 console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
