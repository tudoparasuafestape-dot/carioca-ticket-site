const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./rail-fixture.cjs');
const ROOT=path.resolve(__dirname,'../..'),ORIGIN='http://127.0.0.1:4174';
async function prepare(page,routeName,mode) {
  await page.addInitScript(mode=>{
    window.shareCalls=[];window.copies=[];
    const share=mode==='absent'||mode==='copy-fails'?undefined:async payload=>{
      window.shareCalls.push(payload);
      if(mode==='cancel') throw new DOMException('Cancelled','AbortError');
      if(mode==='pending') await new Promise(resolve=>window.releaseShare=resolve);
    };
    Object.defineProperty(navigator,'share',{configurable:true,value:share});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(mode==='copy-fails')throw new Error('clipboard unavailable');window.copies.push(value);}}});
    sessionStorage.setItem('unrelated-session-fixture','preserved');
  },mode);
  if(routeName==='home') { await fixture(page); await page.goto(ORIGIN+'/?ref=PRIVATE-FIXTURE&token=DO-NOT-SHARE#filters'); }
  else {
    await page.context().route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());
      if(req.method()!=='GET'||url.origin!==ORIGIN||url.pathname.includes('ct-analytics'))return route.abort();
      const file=path.resolve(ROOT,url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1));
      if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
      return route.fulfill({contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(file)});
    });
    await page.goto(ORIGIN+'/parceiro/programa/?ref=PRIVATE-FIXTURE&token=DO-NOT-SHARE#interested');
  }
  return page.locator('[data-public-share="'+routeName+'"]');
}
for(const width of [320,1440]) for(const routeName of ['home','program']) for(const mode of ['native','absent','cancel','copy-fails','pending']) {
 test(`${routeName} share / ${mode} / ${width}px: public canonical only, no automatic send`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:915});
  const host=await prepare(page,routeName,mode),button=host.locator('button');
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName(routeName==='home'?'Compartilhar site':'Compartilhar apresentação');
  const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  if(routeName==='program' && mode==='native') {
    const target=testInfo.outputPath(`program-${width}.png`);
    await page.screenshot({path:target});
  }
  expect(await page.evaluate(()=>window.shareCalls.length+window.copies.length)).toBe(0);
  const canonical='https://cariocaticket.com.br/'+(routeName==='program'?'parceiro/programa/':'');
  await button.click();
  if(mode==='pending') {
    await expect(button).toBeDisabled(); await button.dispatchEvent('click');
    expect(await page.evaluate(()=>window.shareCalls.length)).toBe(1);
    await page.evaluate(()=>window.releaseShare()); await expect(button).toBeEnabled();
  }
  if(['native','pending','cancel'].includes(mode)) {
    expect(await page.evaluate(()=>window.shareCalls)).toEqual([{title:routeName==='home'?'Carioca Ticket':'Programa Parceiro Carioca Ticket',url:canonical}]);
    expect(await page.evaluate(()=>window.copies)).toEqual([]);
    await expect(host.locator('[role="status"]')).toBeEmpty();
  } else if(mode==='absent') {
    expect(await page.evaluate(()=>window.copies)).toEqual([canonical]);
    await expect(host.locator('[role="status"]')).toHaveText('Link copiado.');
  } else {
    await expect(host.locator('input')).toBeVisible(); await expect(host.locator('input')).toHaveValue(canonical);
    await expect(host.locator('[role="status"]')).toContainText('Não foi possível copiar.');
  }
  expect(await page.evaluate(()=>sessionStorage.getItem('unrelated-session-fixture'))).toBe('preserved');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}
