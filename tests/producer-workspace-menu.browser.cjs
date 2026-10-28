// Isolated layout/disclosure smoke: backend/auth scripts intentionally removed.
// No real login, authorization, mutation or network requests are exercised.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CT_CHROMIUM_PATH?{executablePath:process.env.CT_CHROMIUM_PATH}:{}),proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'},args:['--disable-background-networking','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 for(const width of [320,390,1366]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',offline:true});const page=await context.newPage();await context.routeWebSocket('**/*',s=>s.close());
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.origin!=='http://127.0.0.1:4173')return route.abort();
   const file=path.join(root,u.pathname==='/'?'produtor/index.html':u.pathname);
   if(!fs.existsSync(file))return route.abort();
   let body=fs.readFileSync(file);if(file.endsWith('.html'))body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,m=>m.includes('producer-workspace-menu.js')?m:'');
   route.fulfill({body,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'image/png'});
  });
  await page.goto('http://127.0.0.1:4173/');
  await page.evaluate(()=>{document.getElementById('loginView').classList.add('hidden');document.getElementById('portalView').classList.remove('hidden');document.querySelectorAll('.loader,.loading,#loadingOverlay').forEach(e=>e.remove());document.getElementById('topUser').textContent='Produtor de demonstração';document.getElementById('helloName').textContent='Visão geral do produtor';});
  const menu=page.locator('#workspaceMenu');const toggle=page.locator('#workspaceMenuToggle');
  await toggle.click();assert(await menu.evaluate(e=>e.open));
  await page.keyboard.press('Tab');assert(await menu.evaluate(e=>e.contains(document.activeElement)));
  await page.keyboard.press('Escape');assert(!(await menu.evaluate(e=>e.open)));assert(await toggle.evaluate(e=>e===document.activeElement));
  await toggle.click();await page.locator('.top-title').click();assert(!(await menu.evaluate(e=>e.open)));
  await toggle.click();assert(await page.locator('#commercialPolicyLink').isHidden());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'viewport overflow at '+width);
  await page.locator('#centralMobileLink').click({force:true});assert(await menu.evaluate(e=>e.open),'disabled handoff keeps disclosure open');
  await page.locator('#changeEmailButton').click();assert(!(await menu.evaluate(e=>e.open)),'action closes disclosure');
  await toggle.click();await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));assert(!(await menu.evaluate(e=>e.open)),'history restoration closes disclosure');
  await toggle.click();await page.locator('#producerSelect').focus();await page.waitForTimeout(20);assert(!(await menu.evaluate(e=>e.open)),'focus leaving disclosure closes it');
  if(process.env.CT_ARTIFACT_DIR){fs.mkdirSync(process.env.CT_ARTIFACT_DIR,{recursive:true});await toggle.click();await page.screenshot({path:path.join(process.env.CT_ARTIFACT_DIR,'shell-menu-'+width+'.png'),fullPage:true});}
  console.log('PASS native disclosure, keyboard Escape/focus, outside close, permission visibility and no overflow: '+width);
  await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
