'use strict';
// Static public login fixture: all producer scripts are removed before parsing.
// No Firebase, RPC, analytics, service worker, login or authenticated action runs.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const origin='http://127.0.0.1:42979';
const out=path.join(root,'test-results/public-login-polish');
const source=fs.readFileSync(path.join(root,'produtor-v2/index.html'),'utf8');
assert.ok(!source.slice(0,source.indexOf('<title>')).includes('\\n'));
const header='<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="robots" content="noindex,nofollow,noarchive">\n<meta http-equiv="Cache-Control" content="no-store,no-cache,must-revalidate,max-age=0">';
assert.ok(source.includes(header));
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true});
 const external=[],errors=[],results=[];
 let before=false;
 try{
  for(const scheme of ['light','dark']){
   const context=await browser.newContext({colorScheme:scheme,serviceWorkers:'block'});
   await context.route('**/*',route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin==='https://fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:'/* isolated fallback */'});
    if(u.origin!==origin||req.method()!=='GET'){external.push(req.method()+' '+req.url());return route.abort();}
    const p=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));
    if(!p.startsWith(root+path.sep)||!fs.existsSync(p))return route.fulfill({status:404,body:''});
    let body=fs.readFileSync(p);
    if(u.pathname==='/produtor-v2/'){
     let html=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
     if(before)html=html.replace(header,header.replace(/\n/g,'\\n'));
     body=Buffer.from(html);
    }
    const contentType={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'}[path.extname(p)]||'text/plain';
    return route.fulfill({body,contentType});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   for(const width of [320,390,1440])for(const scale of [1,1.5]){
    await page.setViewportSize({width,height:1000});
    // Freeze computed sizes before applying enlarged text; don't compound inherited sizes.
    const enlarge=()=>page.evaluate(factor=>{const sizes=[...document.querySelectorAll('body *')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const [e,size] of sizes)e.style.fontSize=size*factor+'px';},scale);
    before=scheme==='light'&&width===320&&scale===1;
    if(before){
     await page.goto(origin+'/produtor-v2/');
     assert.ok((await page.locator('body').innerText()).startsWith('\\n\\n'));
     await page.screenshot({path:path.join(out,'producer-before.png'),fullPage:true});before=false;
    }
    await page.goto(origin+'/produtor-v2/');await enlarge();
    assert.equal(await page.locator('script').count(),0);
    assert.equal(await page.locator('#portalView').isVisible(),false);
    assert.ok(!(await page.locator('body').innerText()).includes('\\n\\n'));
    // Existing logo RPC is intentionally not simulated; logo remains hidden.
    await page.locator('#email').focus();assert.equal(await page.locator('#email').evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Tab');assert.equal(await page.locator('#senha').evaluate(e=>e===document.activeElement),true);
    const loginOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    results.push({page:'producer',scheme,width,scale,overflow:loginOverflow});
    // Only the whitespace defect is changed. Record any pre-existing narrow-login overflow.
    await page.screenshot({path:path.join(out,`producer-${scheme}-${width}-${scale}.png`),fullPage:true});
    for(const locale of ['pt-BR','en-US','es','zh-Hans']){
     await page.goto(origin+'/ajuda/');await page.locator('#public-language').selectOption(locale);await enlarge();
     assert.equal(await page.locator('html').getAttribute('lang'),locale);
     const email=page.locator('footer a[href="mailto:contato@cariocaticket.com.br"]');
     assert.equal(await email.innerText(),'contato@cariocaticket.com.br');
     assert.equal(await email.evaluate(e=>getComputedStyle(e).overflowWrap),'anywhere');
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Help overflow ${scheme} ${width} ${scale} ${locale}`);
     await email.focus();assert.equal(await email.evaluate(e=>e===document.activeElement),true);
     await page.keyboard.press('Tab');assert.equal(await page.locator('footer a[href="https://instagram.com/cariocaticketbr"]').evaluate(e=>e===document.activeElement),true);
     if(width===320&&scale===1.5)await page.locator('footer').screenshot({path:path.join(out,`help-footer-${scheme}-${locale}-320-text150.png`)});
     results.push({page:'help',scheme,width,scale,locale,overflow:false});
    }
   }
   await context.close();
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,results,external,errors,fixture:'Producer scripts stripped; actual help scripts execute; no requests leave interception.'},null,2));
  console.log(JSON.stringify({passed:true,cases:results.length,external,errors,producerPreexistingOverflow:results.filter(r=>r.overflow)}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
