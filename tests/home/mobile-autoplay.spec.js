const { test, expect } = require('@playwright/test');
const { fixture, events } = require('./rail-fixture.cjs');
const fs = require('node:fs');
const reviewRows = events.map((event, i) => ({ ...event, id:'AUTOPLAY-PREVIEW-' + (i + 1), nome:i ? 'Encontro de cultura e economia criativa — edição de demonstração' : 'Roda de música e encontro de amigos — edição de demonstração', local:'Espaço cultural de demonstração', visual:{ ...event.visual, descricaoCurta:'Programação de demonstração para avaliar a experiência no celular. Dados sintéticos, sem venda ou emissão de ingressos.' } }));
async function setup(page) {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion:'no-preference' });
  const state = await fixture(page, { result:{ sucesso:true, eventos:reviewRows } });
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  await page.evaluate(() => {
    window.autoplayChanges = [];
    const grid = document.getElementById('events-grid');
    let lastIndex = grid.dataset.activeIndex;
    new MutationObserver(() => { const current = grid.dataset.activeIndex; if(current !== lastIndex) { lastIndex = current; window.autoplayChanges.push(current); } }).observe(grid, { attributes:true, attributeFilter:['data-active-index'] });
  });
  return state;
}
async function geometry(page, selector) {
  return page.locator(selector).evaluate(node => new Promise(resolve => {
    const observer = new IntersectionObserver(entries => {
      const entry = entries[0], rect = node.getBoundingClientRect();
      observer.disconnect(); resolve({ ratio:entry.intersectionRatio, intersecting:entry.isIntersecting, top:rect.top, height:rect.height, width:rect.width, viewportWidth:innerWidth, viewportHeight:innerHeight, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches, focus:document.activeElement.tagName });
    }); observer.observe(node);
  }));
}
async function verticalTouch(page, selector) {
  const before = await page.evaluate(() => scrollY);
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2, y = Math.min(page.viewportSize().height - 40, Math.max(180, box.y + Math.min(box.height / 2, 120)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x,y }] });
  for(let i=1; i<=8; i++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x, y:y-i*12 }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
}
for (const [width,height] of [[320,568],[375,667],[390,664],[412,915]]) {
  test(`mobile autoplay starts on first visible portion ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width,height });
    const state = await setup(page), initial = await geometry(page, '#events-grid');
    await page.evaluate(() => { window.autoplayChanges = []; });
    if(width===390) await page.screenshot({path:testInfo.outputPath('autoplay-0-seconds.png')});
    for(let i=0; i<110; i++) {
      await page.clock.runFor(100);
      if(width===390 && i===54) await page.screenshot({path:testInfo.outputPath('autoplay-5-seconds.png')});
      if(width===390 && i===104) await page.screenshot({path:testInfo.outputPath('autoplay-10-seconds.png')});
    }
    const changes = await page.evaluate(() => autoplayChanges);
    const report = { initial, changes, pause:await page.locator('#event-rail-pause').textContent(), blocked:state.blocked, errors:state.errors };
    console.log('INITIAL_AUTOPLAY_DIAGNOSTIC ' + JSON.stringify(report));
    fs.writeFileSync(testInfo.outputPath('initial-autoplay-diagnostic.json'), JSON.stringify(report,null,2));
    await page.screenshot({ path:testInfo.outputPath('initial-autoplay.png') });
    if(!initial.intersecting) expect(changes).toHaveLength(0); else expect(changes.slice(0,2)).toEqual(['1','0']);
    expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  });
}
test('vertical page scroll over events preserves automatic rotation', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport:{ width:390,height:664 }, hasTouch:true,isMobile:true,serviceWorkers:'block' });
  const page = await context.newPage(), state = await setup(page);
  await page.locator('#events-grid').scrollIntoViewIfNeeded();
  await expect(page.locator('#event-rail-pause')).toHaveText('Pausar rotação');
  const initial = await geometry(page, '#events-grid');
  await verticalTouch(page, '.catalog-card:not([inert]) .catalog-photo');
  await expect(page.locator('#event-rail-pause')).toHaveText('Pausar rotação');
  const after = await geometry(page, '#events-grid');
  await page.evaluate(() => { window.autoplayChanges = []; });
  for(let i=0; i<110; i++) await page.clock.runFor(100);
  const changes = await page.evaluate(() => autoplayChanges);
  console.log('VERTICAL_EVENT_DIAGNOSTIC ' + JSON.stringify({ initial,after,changes,pause:await page.locator('#event-rail-pause').textContent() }));
  expect(after.ratio).toBeGreaterThanOrEqual(.25); expect(changes.slice(0,2)).toEqual(['1','0']);
  expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  await page.screenshot({ path:testInfo.outputPath('vertical-scroll-event.png') });
  await context.close();
});
test('vertical page scroll over advertisements preserves automatic rotation', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport:{ width:390,height:664 }, hasTouch:true,isMobile:true,serviceWorkers:'block' });
  const page = await context.newPage(), state = await setup(page), ad = page.locator('#advertising-primary');
  await ad.scrollIntoViewIfNeeded();
  await expect(ad.locator('.ad-playback-state')).toHaveAttribute('data-i18n','adPlayingState');
  await page.evaluate(() => {
    window.adChanges=[];new MutationObserver(records=>{ if(records.some(r=>r.attributeName==='hidden')) window.adChanges.push(performance.now()); }).observe(document.querySelector('#advertising-primary .ad-stage'),{subtree:true,attributes:true,attributeFilter:['hidden']});
  });
  const initial=await geometry(page,'#advertising-primary');
  await verticalTouch(page,'#advertising-primary .ad-stage');
  await expect(ad.locator('.ad-playback-state')).toHaveAttribute('data-i18n','adPlayingState');
  const after=await geometry(page,'#advertising-primary');
  await page.evaluate(()=>{window.adChanges=[];});await page.clock.runFor(11000);
  const changes=await page.evaluate(()=>adChanges);
  console.log('VERTICAL_AD_DIAGNOSTIC '+JSON.stringify({initial,after,changes}));
  expect(after.ratio).toBeGreaterThanOrEqual(.25);expect(changes.length).toBeGreaterThanOrEqual(2);
  expect(state.errors).toEqual([]);expect(state.blocked).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('vertical-scroll-ad.png')});
  await context.close();
});
for (const target of ['events','advertisement']) test(`${target}: partial visibility starts rotation, leaving viewport stops it`, async ({page}) => {
  await page.setViewportSize({width:390,height:664});
  await setup(page);
  const selector=target==='events'?'#events-grid':'#advertising-primary';
  await page.locator(selector).evaluate(node=>window.scrollTo(0,scrollY+node.getBoundingClientRect().top-innerHeight+70));
  const partial=await geometry(page,selector);
  expect(partial.ratio).toBeGreaterThan(0);expect(partial.ratio).toBeLessThan(.25);
  await page.evaluate(target=>{
    window.partialChanges=[];
    const node=document.querySelector(target==='events'?'#events-grid':'#advertising-primary .ad-stage');
    const active=()=>target==='events'?node.dataset.activeIndex:String(Array.from(node.children).findIndex(child=>!child.hidden));
    let last=active();
    new MutationObserver(()=>{const current=active();if(current!==last){last=current;window.partialChanges.push(current);}}).observe(node,{subtree:target!=='events',attributes:true,attributeFilter:[target==='events'?'data-active-index':'hidden']});
  },target);
  for(let i=0;i<110;i++)await page.clock.runFor(100);
  expect((await page.evaluate(()=>partialChanges)).slice(0,2)).toEqual(['1','0']);
  await page.locator('footer').scrollIntoViewIfNeeded();
  expect((await geometry(page,selector)).intersecting).toBe(false);
  await page.evaluate(()=>{window.partialChanges=[];});await page.clock.runFor(11000);
  expect(await page.evaluate(()=>partialChanges)).toEqual([]);
});
test('touch cancellation does not pause, while explicit event and ad pauses survive vertical scrolling',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:664},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const page=await context.newPage();await setup(page);
  await page.locator('#events-grid').scrollIntoViewIfNeeded();
  const grid=page.locator('#events-grid');
  await grid.dispatchEvent('pointerdown',{isPrimary:true,button:0,pointerType:'touch',pointerId:71,clientX:180,clientY:320});
  await grid.dispatchEvent('pointercancel',{isPrimary:true,pointerType:'touch',pointerId:71});
  await expect(page.locator('#event-rail-pause')).toHaveText('Pausar rotação');
  await page.evaluate(()=>{window.autoplayChanges=[];});
  for(let i=0;i<55;i++)await page.clock.runFor(100);
  expect((await page.evaluate(()=>autoplayChanges)).length).toBeGreaterThanOrEqual(1);
  await page.locator('#event-rail-pause').tap();
  await verticalTouch(page,'.catalog-card:not([inert]) .catalog-photo');
  await expect(page.locator('#event-rail-pause')).toHaveText('Retomar rotação');
  await page.evaluate(()=>{window.autoplayChanges=[];});await page.clock.runFor(11000);
  expect(await page.evaluate(()=>autoplayChanges)).toEqual([]);
  const ad=page.locator('#advertising-primary');await ad.scrollIntoViewIfNeeded();
  await ad.locator('.ad-stage').dispatchEvent('pointerdown',{isPrimary:true,button:0,pointerType:'touch',pointerId:72});
  await ad.locator('.ad-stage').dispatchEvent('pointercancel',{isPrimary:true,pointerType:'touch',pointerId:72});
  await expect(ad.locator('.ad-playback-state')).toHaveAttribute('data-i18n','adPlayingState');
  await ad.getByRole('button',{name:'Pausar',exact:true}).tap();
  await verticalTouch(page,'#advertising-primary .ad-stage');
  await expect(ad.locator('.ad-playback-state')).toHaveAttribute('data-i18n','adPausedState');
  const pausedSlide=await ad.locator('.ad-stage').evaluate(node=>Array.from(node.children).findIndex(child=>!child.hidden));
  await page.clock.runFor(5500);
  expect(await ad.locator('.ad-stage').evaluate(node=>Array.from(node.children).findIndex(child=>!child.hidden))).toBe(pausedSlide);
  await expect(ad.locator('.ad-playback-state')).toHaveAttribute('data-i18n','adPausedState');
  await context.close();
});
test('backgrounding clears interrupted touch contact without inventing a permanent pause',async({page})=>{
  await page.setViewportSize({width:390,height:664});await setup(page);
  await page.locator('#events-grid').scrollIntoViewIfNeeded();
  await page.locator('#events-grid').dispatchEvent('pointerdown',{isPrimary:true,button:0,pointerType:'touch',pointerId:81,clientX:180,clientY:320});
  async function hidden(value){await page.evaluate(value=>{Object.defineProperty(document,'hidden',{configurable:true,value});document.dispatchEvent(new Event('visibilitychange'));},value);}
  await hidden(true);await page.evaluate(()=>{window.autoplayChanges=[];});await page.clock.runFor(11000);
  expect(await page.evaluate(()=>autoplayChanges)).toEqual([]);
  await hidden(false);for(let i=0;i<55;i++)await page.clock.runFor(100);
  expect(await page.evaluate(()=>autoplayChanges)).toEqual(['1']);
  const ad=page.locator('#advertising-primary');await ad.scrollIntoViewIfNeeded();
  await ad.locator('.ad-stage').dispatchEvent('pointerdown',{isPrimary:true,button:0,pointerType:'touch',pointerId:82});
  const active=()=>ad.locator('.ad-stage').evaluate(node=>Array.from(node.children).findIndex(child=>!child.hidden));
  const before=await active();await hidden(true);await page.clock.runFor(11000);expect(await active()).toBe(before);
  await hidden(false);await page.clock.runFor(5500);expect(await active()).not.toBe(before);
  await expect(ad.locator('.ad-playback-state')).toHaveAttribute('data-i18n','adPlayingState');
});
