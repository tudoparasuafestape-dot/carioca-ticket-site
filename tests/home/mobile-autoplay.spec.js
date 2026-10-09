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
    new MutationObserver(records => { if(records.some(r => r.attributeName === 'data-active-index')) window.autoplayChanges.push(grid.dataset.activeIndex); }).observe(grid, { attributes:true, attributeFilter:['data-active-index'] });
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
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2, y = Math.min(page.viewportSize().height - 40, Math.max(180, box.y + Math.min(box.height / 2, 120)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x,y }] });
  for(let i=1; i<=8; i++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x, y:y-i*12 }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
}
for (const [width,height] of [[320,568],[375,667],[390,664],[412,915]]) {
  test(`production autoplay initial viewport diagnostic ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width,height });
    const state = await setup(page), initial = await geometry(page, '#events-grid');
    await page.evaluate(() => { window.autoplayChanges = []; });
    for(let i=0; i<110; i++) await page.clock.runFor(100);
    const changes = await page.evaluate(() => autoplayChanges);
    const report = { initial, changes, pause:await page.locator('#event-rail-pause').textContent(), blocked:state.blocked, errors:state.errors };
    console.log('INITIAL_AUTOPLAY_DIAGNOSTIC ' + JSON.stringify(report));
    fs.writeFileSync(testInfo.outputPath('initial-autoplay-diagnostic.json'), JSON.stringify(report,null,2));
    await page.screenshot({ path:testInfo.outputPath('initial-autoplay.png') });
    if(initial.ratio < .25) expect(changes).toHaveLength(0); else expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  });
}
test('production event vertical-scroll diagnostic: normal page gesture permanently pauses rotation', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport:{ width:390,height:664 }, hasTouch:true,isMobile:true,serviceWorkers:'block' });
  const page = await context.newPage(), state = await setup(page);
  await page.locator('#events-grid').scrollIntoViewIfNeeded();
  await expect(page.locator('#event-rail-pause')).toHaveText('Pausar rotação');
  const initial = await geometry(page, '#events-grid');
  await verticalTouch(page, '.catalog-card:not([inert]) .catalog-photo');
  await expect(page.locator('#event-rail-pause')).toHaveText('Retomar rotação');
  const after = await geometry(page, '#events-grid');
  await page.evaluate(() => { window.autoplayChanges = []; });
  for(let i=0; i<110; i++) await page.clock.runFor(100);
  const changes = await page.evaluate(() => autoplayChanges);
  console.log('VERTICAL_EVENT_DIAGNOSTIC ' + JSON.stringify({ initial,after,changes,pause:await page.locator('#event-rail-pause').textContent() }));
  expect(after.ratio).toBeGreaterThanOrEqual(.25); expect(changes).toHaveLength(0);
  expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  await page.screenshot({ path:testInfo.outputPath('vertical-scroll-event.png') });
  await context.close();
});
test('production advertisement vertical-scroll diagnostic: normal page gesture permanently pauses rotation', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport:{ width:390,height:664 }, hasTouch:true,isMobile:true,serviceWorkers:'block' });
  const page = await context.newPage(), state = await setup(page), ad = page.locator('#advertising-primary');
  await ad.scrollIntoViewIfNeeded();
  await expect(ad.locator('.ad-playback-state')).toHaveAttribute('data-i18n','adPlayingState');
  await page.evaluate(() => {
    window.adChanges=[];new MutationObserver(records=>{ if(records.some(r=>r.attributeName==='hidden')) window.adChanges.push(performance.now()); }).observe(document.querySelector('#advertising-primary .ad-stage'),{subtree:true,attributes:true,attributeFilter:['hidden']});
  });
  const initial=await geometry(page,'#advertising-primary');
  await verticalTouch(page,'#advertising-primary .ad-stage');
  await expect(ad.locator('.ad-playback-state')).toHaveAttribute('data-i18n','adPausedState');
  const after=await geometry(page,'#advertising-primary');
  await page.evaluate(()=>{window.adChanges=[];});await page.clock.runFor(11000);
  const changes=await page.evaluate(()=>adChanges);
  console.log('VERTICAL_AD_DIAGNOSTIC '+JSON.stringify({initial,after,changes}));
  expect(after.ratio).toBeGreaterThanOrEqual(.25);expect(changes).toHaveLength(0);
  expect(state.errors).toEqual([]);expect(state.blocked).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('vertical-scroll-ad.png')});
  await context.close();
});
