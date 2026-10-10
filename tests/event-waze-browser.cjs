// Full public templates, synthetic fixtures only. No external navigation, RPC or purchases.
'use strict';
const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const server = require('./event-uber-preview-server.cjs');
const origin = `http://127.0.0.1:${Number(process.env.CT_EVENT_PREVIEW_PORT || 42979)}`;
const out = 'test-results/event-waze';
fs.mkdirSync(out, {recursive: true});
const report = [];
const events = [
  {key:'roda', id:'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD', local:'Vevets Recepções', endereco:'Rua Arenópolis, 82 - Candeias', cidade:'Jaboatão dos Guararapes', uf:'PE'},
  {key:'era', id:'EVT-23112026-ERA-BEAUTY-EAC4B673', local:'SEBRAE PE', endereco:'Rua Tabajaras, 360 - Ilha do Retiro', cidade:'Recife', uf:'PE'}
];
const labels = {'pt-BR':'Ir com Waze', 'en-US':'Go with Waze', es:'Ir con Waze', 'zh-Hans':'使用 Waze 导航'};
function contrast(fg, bg) {
  const lum = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(v => {
    v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  }).reduce((total, v, i) => total + v * [.2126,.7152,.0722][i], 0);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
}
async function hidden(page) {
  for (const id of ['directions-waze', 'directions-uber']) {
    await expect(page.locator('#' + id)).toBeHidden();
    assert.equal(await page.locator('#' + id).getAttribute('href'), null);
  }
  await expect(page.locator('#directions-waze-note')).toBeHidden();
}
async function render(page, event) {
  await page.evaluate(event => {
    CTEventDirections.render(event);
    CTEventUber.render(event, event.id);
  }, event);
}
(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      proxy: {server:'http://127.0.0.1:9', bypass:'127.0.0.1'},
      args:['--disable-background-networking', '--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']
    });
    for (const route of ['evento','evento-v2']) for (const event of events) for (const locale of Object.keys(labels)) {
      const context = await browser.newContext({viewport:{width:390,height:1100}, serviceWorkers:'block', permissions:[]});
      const external = [], errors = [];
      await context.addInitScript(locale => {
        localStorage.setItem('ct-home-locale', locale);
        Object.defineProperty(navigator, 'clipboard', {value:{writeText:async value => {window.copied = value;}}});
      }, locale);
      await context.route('**/*', request => {
        const url = new URL(request.request().url());
        if (url.origin === origin && request.request().method() === 'GET') return request.continue();
        external.push(url.origin + url.pathname);
        return request.abort('blockedbyclient');
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`${origin}/${route}/?evento=${event.id}&scenario=${event.key}`);
      await page.locator('#app').waitFor({state:'visible'});
      const waze = page.locator('#directions-waze'), uber = page.locator('#directions-uber');
      await expect(waze).toBeVisible();
      await expect(waze).toHaveAccessibleName(labels[locale]);
      assert.equal(await waze.getAttribute('lang'), locale);
      assert.equal(await waze.getAttribute('aria-label'), null);
      assert.equal(await waze.getAttribute('aria-describedby'), 'directions-waze-note');
      assert.equal(await page.locator('#directions-waze-note').getAttribute('lang'), locale);
      await expect(page.locator('#directions-waze-note')).toBeVisible();
      assert.equal(await uber.evaluate(node => node.nextElementSibling.id), 'directions-waze');
      const href = await waze.getAttribute('href'), url = new URL(href);
      const drop = JSON.parse(new URL(await uber.getAttribute('href')).searchParams.get('drop[0]'));
      assert.equal(url.origin, 'https://waze.com'); assert.equal(url.pathname, '/ul');
      assert.deepEqual([...url.searchParams.keys()], ['ll','navigate']);
      assert.equal(url.searchParams.get('ll'), `${drop.latitude},${drop.longitude}`);
      assert.match(href, /ll=-?[\d.]+%2C-?[\d.]+&navigate=yes$/);
      assert.equal(url.searchParams.get('navigate'), 'yes');
      assert.equal(await waze.getAttribute('target'), '_self');
      assert.equal(await waze.getAttribute('rel'), 'noreferrer');
      for (const width of [320,390,768,1440]) for (const theme of ['light','dark']) {
        await page.setViewportSize({width,height:1100}); await page.selectOption('#home-theme', theme);
        await waze.scrollIntoViewIfNeeded();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route}/${event.key}/${locale}/${width}/${theme}: overflow`);
        const a = await uber.boundingBox(), b = await waze.boundingBox();
        assert(a.height >= 44 && b.height >= 44 && b.width >= 44);
        assert(b.x >= 0 && b.x + b.width <= width + 1);
        assert(b.y >= a.y && (b.y >= a.y + a.height || b.x >= a.x + a.width));
        const colors = await waze.evaluate(node => {const s=getComputedStyle(node);return [s.color,s.backgroundColor];});
        assert(contrast(...colors) >= 4.5, `Waze text contrast: ${colors}`);
        await uber.focus(); await page.keyboard.press('Tab');
        await expect(waze).toBeFocused();
        assert(await waze.evaluate(node => {const s=getComputedStyle(node);return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;}));
        await page.locator('#event-directions').screenshot({path:`${out}/${route}-${event.key}-${locale}-${width}-${theme}.png`});
      }
      await page.emulateMedia({forcedColors:'active'});
      await expect(waze).toBeVisible();
      await page.locator('#event-directions').screenshot({path:`${out}/${route}-${event.key}-${locale}-forced-colors.png`});
      await page.emulateMedia({forcedColors:'none'});
      await page.setViewportSize({width:320,height:1100});
      await waze.evaluate(node => {node.style.fontSize='21px';});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await waze.evaluate(node => {node.style.removeProperty('font-size');});
      const before = page.url();
      // The preview's capture listener blocks the real destination even after repeated activation.
      await waze.click(); await waze.focus(); await page.keyboard.press('Enter');
      assert.equal(page.url(), before);
      await expect(page.locator('#preview-notice')).toContainText('Destino bloqueado');
      assert.equal(await waze.getAttribute('href'), href);
      await page.locator('#directions-copy').click();
      assert.equal(await page.evaluate(() => window.copied), await page.locator('#directions-address').inputValue());
      assert.equal(await waze.getAttribute('href'), href);
      for (const next of Object.keys(labels)) {
        await page.evaluate(next => {localStorage.setItem('ct-home-locale',next);document.dispatchEvent(new Event('ct:public-language'));}, next);
        await expect(waze).toHaveAccessibleName(labels[next]); assert.equal(await waze.getAttribute('href'), href);
      }
      for (const bad of [{...event,id:'UNKNOWN'}, {...event,endereco:'Outra rua, 9'}, {...event,local:'Online'}, {}]) {
        await page.evaluate(({event,id}) => {CTEventDirections.render(event);CTEventUber.render(event,id);}, {event:bad,id:event.id});
        await hidden(page);
        await page.evaluate(() => {dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));document.dispatchEvent(new Event('ct:public-language'));});
        await hidden(page);
      }
      await render(page, event); await expect(waze).toBeVisible();
      await page.evaluate(() => CTEventUber.clear());
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await hidden(page);
      await page.reload(); await page.locator('#app').waitFor({state:'visible'}); await expect(waze).toBeVisible();
      assert.equal(await waze.getAttribute('href'), href);
      assert.deepEqual(errors, []);
      assert(!external.some(url => /(?:waze|uber)\.com/.test(url)), 'Transport provider requested before navigation');
      report.push({route,event:event.key,locale,passed:true,blockedExternal:[...new Set(external)],screenshots:9});
      await context.close();
    }
    console.log('PASS: Waze on both full public templates; two eligible fixtures; four locales; four widths; light/dark/forced colors; keyboard, contrast, copy, repeated activation, stale/invalid state and reload; all external traffic blocked.');
  } finally {
    fs.writeFileSync(out + '/report.json', JSON.stringify(report,null,2));
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => {console.error(error);server.close();process.exitCode=1;});
