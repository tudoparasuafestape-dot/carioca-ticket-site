const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { fixture, events } = require('./rail-fixture.cjs');
const { capture } = require('./capture.cjs');
const EVIDENCE = path.resolve(__dirname, '../../docs/reviews/home-rails/screenshots');
function rows(n) {
  return Array.from({ length:n }, (_, i) => ({ ...events[i % 2], id:'PREVIEW-RAIL-' + (i + 1), nome:events[i % 2].nome + ' ' + (i + 1) }));
}
async function open(page, n=15, options={}) {
  const state=await fixture(page,{ ...options, result:options.result || { sucesso:true,eventos:rows(n) } });
  await expect(page.locator('#events-grid')).toHaveAttribute('data-active-index','0');
  return state;
}
async function active(page,n) { await expect(page.locator('#events-grid')).toHaveAttribute('data-active-index',String(n)); }
async function visibility(page,selector,expected) {
  await page.locator(selector).evaluate((node,expected)=>new Promise(resolve=>{const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting===expected){observer.disconnect();resolve();}},{threshold:.25});observer.observe(node);}),expected);
}
async function overflow(page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box=await page.locator('.catalog-card:not([inert])').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width);
}
for(const width of [320,412,1440]) for(const theme of ['light','dark']) for(const count of [1,2,15]) {
  test(`${count} events / ${width}px / ${theme}: legible horizontal feature, original facts and links`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
    const state=await open(page,count);
    await expect(page.locator('.catalog-card')).toHaveCount(count);
    await overflow(page);
    const initialHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
    for(let i=0;i<count;i++) {
      const card=page.locator('.catalog-card:not([inert])');
      const row=rows(count)[i];
      for(const field of ['nome','local','cidade','uf','data','horario']) await expect(card).toContainText(row[field]);
      await expect(card.locator('.btn-primary')).toHaveAttribute('href','/checkout/?evento='+row.id);
      await expect(card.locator('.catalog-title a')).toHaveAttribute('href','/evento/?evento='+row.id);
      expect(await card.locator('.catalog-photo img').evaluate(img=>getComputedStyle(img).objectFit)).toBe('contain');
      if(count>1 && i<count-1) await page.locator('#event-rail-next').click();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(initialHeight);
    if(count===1) await expect(page.locator('#event-rail-controls')).toBeHidden();
    else { await page.locator('#events-grid').focus(); await page.keyboard.press('Home'); await active(page,0); }
    await overflow(page);
    expect(state.methods).toEqual(['ctEventosPublicosListarPROD']);
    expect(state.blocked).toEqual([]); expect(state.errors).toEqual([]);
    if(count===15) { await page.locator('#event-feature').scrollIntoViewIfNeeded(); await capture(page,path.join(EVIDENCE,`${theme}-${width}-15.png`)); }
  });
}
test('automatic advances every five seconds, moves left and loops without moving page or focus',async({page})=>{
  await page.clock.install();
  await open(page,2);
  await visibility(page,'#events-grid',true);
  const before=await page.evaluate(()=>({y:scrollY,focus:document.activeElement.tagName,height:document.documentElement.scrollHeight}));
  await page.evaluate(()=>{
    window.railTimings=[]; window.railMovedLeft=false; window.railHistory=[]; var lastIndex=0;
    const grid=document.getElementById('events-grid');
    new MutationObserver(records=>{
      if(records.some(r=>r.target===grid && r.attributeName==='data-moving') && grid.dataset.moving) window.railTimings.push(performance.now());
      if(records.some(r=>r.target===grid && r.attributeName==='data-active-index') && Number(grid.dataset.activeIndex)!==lastIndex) { lastIndex=Number(grid.dataset.activeIndex); window.railHistory.push(lastIndex); }
      if(grid.dataset.moving && Array.from(grid.children).some(n=>n.style.transform.startsWith('translateX(-'))) window.railMovedLeft=true;
    }).observe(grid,{attributes:true,subtree:true,attributeFilter:['data-moving','style','data-active-index']});
  });
  for(let i=0;i<108;i++) await page.clock.runFor(100);
  const timing=await page.evaluate(()=>({times:window.railTimings,left:window.railMovedLeft,history:window.railHistory}));
  expect(timing.times.length).toBeGreaterThanOrEqual(2); expect(timing.left).toBe(true);
  expect(timing.history.slice(0,2)).toEqual([1,0]);
  expect(timing.times[1]-timing.times[0]).toBeGreaterThanOrEqual(4900);
  expect(timing.times[1]-timing.times[0]).toBeLessThanOrEqual(5100);
  expect(await page.evaluate(()=>({y:scrollY,focus:document.activeElement.tagName,height:document.documentElement.scrollHeight}))).toEqual(before);
  await expect(page.locator('#event-rail-announcement')).toBeEmpty();
});
test('pause, focus, hover and offscreen visibility stop rotation; resume is explicit after interaction',async({page})=>{
  await page.clock.install(); await open(page,2);
  await page.locator('#event-rail-pause').click(); await page.mouse.move(0,0);
  await page.locator('#event-search-input').focus();
  await page.clock.runFor(11000); await active(page,0);
  await expect(page.locator('#event-rail-pause')).toHaveText('Retomar rotação');
  await page.locator('#event-rail-pause').click();
  await page.locator('#event-search-input').focus(); await page.mouse.move(0,0);
  await page.clock.runFor(5400); await active(page,1);
  await page.locator('#event-feature').hover(); await page.clock.runFor(11000); await active(page,1);
  await page.mouse.move(0,0);
  await page.locator('footer').scrollIntoViewIfNeeded(); await visibility(page,'#events-grid',false); await page.clock.runFor(11000); await active(page,1);
  await page.locator('#events-grid').scrollIntoViewIfNeeded();
  await page.locator('.catalog-card:not([inert]) .catalog-title a').focus();
  await page.locator('#event-search-input').focus(); await page.clock.runFor(11000); await active(page,1);
  await expect(page.locator('#event-rail-pause')).toHaveText('Retomar rotação');
});
test('keyboard remains on controls, inactive links are excluded, arrows and Home/End work',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'}); await open(page,15);
  await page.locator('#events-grid').focus(); await page.keyboard.press('ArrowRight'); await active(page,1);
  await expect(page.locator('#events-grid')).toBeFocused();
  await page.keyboard.press('End'); await active(page,14);
  await page.keyboard.press('Home'); await active(page,0);
  await page.keyboard.press('Tab');
  await expect(page.locator('.catalog-card').first().locator('.catalog-photo')).toBeFocused();
  expect(await page.getByRole('link',{name:/^Comprar ingresso:/}).count()).toBe(1);
  const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));
  expect(new Set(ids).size).toBe(ids.length);
});
test('mouse drag on a card link never opens a destination and preserves vertical position',async({page})=>{
  await open(page,15); await page.locator('#events-grid').scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>scrollY), start=page.url();
  const box=await page.locator('.catalog-card').first().locator('.catalog-photo').boundingBox();
  await page.mouse.move(box.x+box.width*.75,box.y+box.height*.5); await page.mouse.down();
  await page.mouse.move(box.x+box.width*.25,box.y+box.height*.5,{steps:12}); await page.mouse.up();
  await active(page,1); expect(page.url()).toBe(start); expect(await page.evaluate(()=>scrollY)).toBe(before);
  await expect(page.locator('#event-rail-pause')).toHaveText('Retomar rotação');
});
test('real touch swipe advances, vertical touch remains page scrolling, no accidental navigation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:412,height:915},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const page=await context.newPage(); await open(page,15); await page.locator('#events-grid').scrollIntoViewIfNeeded();
  const cdp=await context.newCDPSession(page), box=await page.locator('.catalog-card').first().locator('.catalog-photo').boundingBox();
  const y=box.y+box.height/2, x=box.x+box.width*.8, before=await page.evaluate(()=>scrollY);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*24,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await active(page,1);
  expect(page.url()).toBe('http://127.0.0.1:4174/'); expect(await page.evaluate(()=>scrollY)).toBe(before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:650}]});
  for(let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:650-i*25}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before); await active(page,1);
  await context.close();
});
test('reduced motion, unavailable storage, text enlargement and 200% reflow keep controls usable',async({page})=>{
  await page.clock.install(); await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{ Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}); sessionStorage.setItem('existing-session-fixture','unchanged'); });
  await page.setViewportSize({width:320,height:915}); await open(page,15);
  await page.clock.runFor(15000); await active(page,0); await expect(page.locator('#event-rail-pause')).toBeDisabled();
  await page.locator('#accessibility-toggle').click();
  for(let i=0;i<5;i++) await page.locator('#font-up').click();
  await page.locator('#accessibility-toggle').click(); await overflow(page);
  await page.locator('#event-rail-next').click(); await active(page,1); await overflow(page);
  expect(await page.evaluate(()=>sessionStorage.getItem('existing-session-fixture'))).toBe('unchanged');
  await page.setViewportSize({width:720,height:500}); await overflow(page);
});
test('filters, empty/error/retry and broken covers reset the feature without a second RPC',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const state=await open(page,15);
  await page.locator('#event-rail-next').click(); await active(page,1);
  await page.locator('#event-search-input').fill('criativo'); await page.locator('#event-search-form button').click();
  await active(page,0); await expect(page.locator('.catalog-card')).toHaveCount(7);
  await page.locator('#event-search-input').fill('does-not-exist'); await page.locator('#event-search-form button').click();
  await expect(page.locator('#event-feature')).toBeHidden(); await expect(page.locator('#no-events')).toBeVisible();
  await page.locator('#clear-event-search').click(); await active(page,0);
  expect(state.methods).toHaveLength(1);
});
for(const slot of ['primary','secondary']) test(`${slot} advertisement: existing 5-second timer, stable randomized start and interaction pauses`,async({page})=>{
  await page.clock.install(); await open(page,2,{random:.99});
  const ad=page.locator('#advertising-'+slot); await ad.scrollIntoViewIfNeeded(); await page.mouse.move(0,0);
  await expect(ad.locator('.ad-house')).toBeVisible();
  await ad.evaluate(node=>{ window.adTimings=[]; new MutationObserver(()=>window.adTimings.push({time:performance.now(),house:!node.querySelector('.ad-house').hidden})).observe(node.querySelector('.ad-stage'),{subtree:true,attributes:true,attributeFilter:['hidden']}); });
  await page.clock.runFor(10500);
  const timings=await page.evaluate(()=>window.adTimings);
  expect(timings).toHaveLength(2); expect(timings.map(t=>t.house)).toEqual([false,true]);
  expect(timings[1].time-timings[0].time).toBeGreaterThanOrEqual(4900);
  expect(timings[1].time-timings[0].time).toBeLessThanOrEqual(5100);
  await expect(ad.locator('.eyebrow')).toHaveText('Publicidade');
  const href=await ad.locator('.ad-campaign').getAttribute('href');
  expect(href).toBe(slot==='primary'?'https://www.instagram.com/tudoparasuafestape/':'https://wa.me/5581996200696');
  await expect(ad.locator('.ad-house')).toBeVisible();
  await ad.getByRole('button',{name:'Próxima publicidade'}).click(); await page.mouse.move(0,0);
  await page.locator('#event-search-input').focus(); await ad.scrollIntoViewIfNeeded();
  await page.clock.runFor(11000); await expect(ad.locator('.ad-campaign')).toBeVisible();
  await expect(ad.locator('.ad-playback-state')).toHaveText('Rotação pausada');
  await page.locator('#home-language').selectOption('en-US',{force:true});
  await expect(ad.locator('.ad-campaign')).toBeVisible();
});
test('ads start on artwork under fixture seed and stay paused with reduced motion',async({page})=>{
  await page.clock.install(); await page.emulateMedia({reducedMotion:'reduce'}); await open(page,2);
  const ad=page.locator('#advertising-primary'); await ad.scrollIntoViewIfNeeded();
  await page.clock.runFor(16000); await expect(ad.locator('.ad-campaign')).toBeVisible();
  await expect(ad.getByRole('button',{name:'Reproduzir'})).toBeDisabled();
  await ad.getByRole('button',{name:'Próxima publicidade'}).click(); await expect(ad.locator('.ad-house')).toBeVisible();
});
test('hidden document freezes event and advertisement timers, image failure keeps the house fallback',async({page})=>{
  await page.clock.install(); await open(page,2);
  await page.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(16000); await active(page,0);
  const ad=page.locator('#advertising-primary'); await ad.scrollIntoViewIfNeeded();
  await page.clock.runFor(16000); await expect(ad.locator('.ad-campaign')).toBeVisible();
  await ad.locator('img').evaluate(img=>img.dispatchEvent(new Event('error')));
  await expect(ad.locator('.ad-house')).toBeVisible(); await expect(ad.locator('.ad-controls')).toBeHidden();
  await expect(ad.locator('.eyebrow')).toHaveText('Publicidade');
});
