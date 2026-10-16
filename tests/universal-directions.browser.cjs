// Real public templates/assets, entirely synthetic data, no real RPC or external
// navigation. Execute Chromium only in the authorized isolated CI environment.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./universal-directions-fixture.cjs');
const out = path.resolve(process.env.CT_UNIVERSAL_OUTPUT_DIR || 'test-results/universal-directions');
const locales = {
  'pt-BR': {uber:'Ir de Uber',waze:'Ir com Waze',once:'Carregar este mapa uma vez',map:'Abrir no Google Maps (nova aba)'},
  'en-US': {uber:'Go with Uber',waze:'Go with Waze',once:'Load this map once',map:'Open in Google Maps (new tab)'},
  es: {uber:'Ir con Uber',waze:'Ir con Waze',once:'Cargar este mapa una vez',map:'Abrir en Google Maps (nueva pestaña)'},
  'zh-Hans': {uber:'乘坐 Uber',waze:'使用 Waze 导航',once:'单次加载此地图',map:'在 Google 地图中打开（新标签页）'}
};
const widths = [320,390,1440];
const themes = ['light','dark'];
const providerRequest = entry => ['maps.google.com','www.google.com','waze.com','m.uber.com'].includes(entry.hostname);

function contrast(fg, bg) {
  const lum = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(value => {
    value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  }).reduce((total,value,index) => total + value * [.2126,.7152,.0722][index], 0);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
}
async function colors(locator) {
  return locator.evaluate(node => {
    const foreground = getComputedStyle(node).color;
    // All tested surfaces are opaque or transparent over an opaque ancestor.
    let ancestor = node, background = '';
    while (ancestor) {
      const value = getComputedStyle(ancestor).backgroundColor;
      if (value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)') {background = value; break;}
      ancestor = ancestor.parentElement;
    }
    return [foreground, background || 'rgb(255, 255, 255)'];
  });
}
async function render(page, event, requestedId = event.id) {
  await page.evaluate(({response,requestedId}) => window.__CT_UNIVERSAL_TEMPLATE_HOOKS__.render(response, requestedId), {response:fixture.payload(event),requestedId});
}
async function clearAssertions(page, expect, description) {
  await expect(page.locator('#directions-details'), description).toBeHidden();
  for (const id of ['directions-uber','directions-waze','directions-map']) {
    assert.equal(await page.locator('#' + id).getAttribute('href'), null, `${description}: ${id} stale href`);
  }
  for (const id of ['directions-uber','directions-waze','directions-uber-note','directions-waze-note','directions-map-preview']) {
    await expect(page.locator('#' + id), description).toBeHidden();
  }
  assert.equal(await page.locator('#directions-address').inputValue(), '', `${description}: stale address`);
  assert.equal(await page.evaluate(() => CTEventDirections.getMapDestination()), '', `${description}: stale shared destination`);
  assert.equal(await page.locator('#directions-map-preview iframe').count(), 0, `${description}: stale map iframe`);
}
async function sharedPinAssertions(page, expect, event, locale) {
  const point = `${event.destinoTransporte.latitude},${event.destinoTransporte.longitude}`;
  const uber = page.locator('#directions-uber'), waze = page.locator('#directions-waze'), maps = page.locator('#directions-map');
  for (const locator of [uber,waze,maps]) await expect(locator).toBeVisible();
  await expect(uber).toHaveAccessibleName(locales[locale].uber);
  await expect(waze).toHaveAccessibleName(locales[locale].waze);
  const mark = waze.locator('img.waze-mark');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('src', '/assets/waze-mark.svg');
  await expect(mark).toHaveAttribute('alt', '');
  await expect(mark).toHaveAttribute('aria-hidden', 'true');
  await expect(mark).toHaveJSProperty('complete', true);
  assert(await mark.evaluate(node => node.naturalWidth > 0 && node.naturalHeight > 0), 'Official local Waze icon must decode for a generic event');

  await expect(maps).toHaveAccessibleName(locales[locale].map);
  const uberUrl = new URL(await uber.getAttribute('href'));
  const drop = JSON.parse(uberUrl.searchParams.get('drop[0]'));
  const wazeUrl = new URL(await waze.getAttribute('href'));
  const mapsUrl = new URL(await maps.getAttribute('href'));
  assert.equal(uberUrl.origin, 'https://m.uber.com');
  assert.equal(uberUrl.pathname, '/looking');
  assert.deepEqual([...uberUrl.searchParams.keys()], ['pickup','drop[0]']);
  assert.equal(uberUrl.searchParams.get('pickup'), 'my_location');
  assert.equal(`${drop.latitude},${drop.longitude}`, point);
  assert.equal(drop.addressLine1, event.local);
  assert.equal(drop.addressLine2, [event.endereco,event.cidade,event.uf,'Brasil'].join(', '));
  assert.equal(wazeUrl.origin, 'https://waze.com');
  assert.equal(wazeUrl.pathname, '/ul');
  assert.deepEqual([...wazeUrl.searchParams.keys()], ['ll','navigate']);
  assert.equal(wazeUrl.searchParams.get('ll'), point);
  assert.equal(wazeUrl.searchParams.get('navigate'), 'yes');
  assert.equal(mapsUrl.origin, 'https://www.google.com');
  assert.equal(mapsUrl.pathname, '/maps/dir/');
  assert.deepEqual([...mapsUrl.searchParams.keys()], ['api','destination']);
  assert.equal(mapsUrl.searchParams.get('destination'), point);
  assert.equal(await page.evaluate(() => CTEventDirections.getMapDestination()), point);
  assert.equal(await uber.getAttribute('aria-describedby'), 'directions-uber-note');
  assert.equal(await waze.getAttribute('aria-describedby'), 'directions-waze-note');
  assert.equal(await uber.getAttribute('target'), '_self');
  assert.equal(await waze.getAttribute('target'), '_self');
  assert.equal(await maps.getAttribute('target'), '_blank');
  assert.match(await maps.getAttribute('rel'), /noopener/);
  assert.match(await maps.getAttribute('rel'), /noreferrer/);
  assert.equal(await uber.getAttribute('lang'), locale);
  assert.equal(await waze.getAttribute('lang'), locale);
  assert.equal(await page.evaluate(id => Object.hasOwn(CTEventRideDestinations,id), event.id), false, 'Must work without a registry entry');
  await expect(page.locator('#directions-address')).toHaveAccessibleName(/.+/);
  assert.equal(await page.locator('#directions-address').getAttribute('readonly'), '');
  return point;
}
async function loadedMapAssertions(page, expect, point) {
  const frame = page.locator('#directions-map-preview iframe');
  await expect(frame).toHaveCount(1);
  const url = new URL(await frame.getAttribute('src'));
  assert.equal(url.origin, 'https://maps.google.com');
  assert.equal(url.pathname, '/maps');
  assert.deepEqual([...url.searchParams.keys()], ['output','q']);
  assert.equal(url.searchParams.get('q'), point);
  assert.equal(url.searchParams.get('output'), 'embed');
  assert.equal(await frame.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(await frame.getAttribute('allow'), "geolocation 'none'; camera 'none'; microphone 'none'");
  assert((await frame.getAttribute('title')).length > 5);
  return frame.elementHandle();
}
async function saveMapPermission(page, expect, enabled) {
  await page.locator('#directions-map-preview .event-map-preferences').click();
  await expect(page.locator('#ct-privacy-dialog')).toBeVisible();
  await page.locator('#ct-privacy-maps').setChecked(enabled);
  await page.locator('#ct-privacy-analytics').setChecked(false);
  await page.locator('#ct-privacy-dialog [data-privacy-copy="save"]').click();
  await expect(page.locator('#ct-privacy-dialog')).toBeHidden();
  assert.equal(await page.evaluate(() => CTPrivacy.allowed('maps')), enabled);
  assert.equal(await page.evaluate(() => CTPrivacy.allowed('analytics')), false);
}

async function runCase(browser, expect, route, locale, result) {
  const context = await browser.newContext({
    viewport:{width:390,height:1100}, offline:true, serviceWorkers:'block', permissions:[], locale:'pt-BR'
  });
  const external = [], localFailures = [], pageErrors = [];
  let page;
  await context.addInitScript(locale => {
    // Do not reset the parent page's choice when its transient RPC/map iframe
    // receives an init script. The test owns only the top-level fixture state.
    if (window !== window.top) return;
    localStorage.setItem('ct-home-locale', locale);
    localStorage.removeItem('ct-public-privacy-v1');
  }, locale);
  await context.route('**/*', async routeRequest => {
    const request = routeRequest.request(), url = new URL(request.url());
    if (url.origin === fixture.origin && request.method() === 'GET') {
      try { return await routeRequest.fulfill(fixture.localResponse(url.href, request.method())); }
      catch (error) {
        localFailures.push({path:url.pathname,reason:String(error.message)});
        return routeRequest.abort('blockedbyclient');
      }
    }
    external.push({hostname:url.hostname,path:url.pathname,method:request.method(),blocked:true});
    return routeRequest.abort('blockedbyclient');
  });
  try {
    page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(`${fixture.origin}/${route}/?evento=${fixture.thirdEvent.id}`, {waitUntil:'load'});
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#ct-privacy-banner')).toBeVisible();
    assert.equal(await page.evaluate(() => navigator.onLine), false, 'Browser must remain offline');
    assert.equal(await page.evaluate(() => CTPrivacy.allowed('maps')), false);
    const point = await sharedPinAssertions(page, expect, fixture.thirdEvent, locale);
    await page.locator('#event-directions').scrollIntoViewIfNeeded();
    await expect(page.locator('.event-map-once')).toHaveAccessibleName(locales[locale].once);
    assert.equal(await page.locator('#directions-map-preview iframe').count(), 0, 'No map iframe before consent');
    assert.equal(await page.locator('iframe[src^="http"]').count(), 0, 'No external iframe before consent');
    assert.equal(external.filter(providerRequest).length, 0, 'No provider request before consent');
    result.checks.push('generic third-event contract; same Uber/Waze/Google destination; zero map iframe/request before consent');
    await page.locator('#ct-privacy-banner [data-privacy-copy="reject"]').click();
    await expect(page.locator('#ct-privacy-banner')).toBeHidden();

    for (const width of widths) for (const theme of themes) {
      await page.setViewportSize({width,height:1100});
      await page.selectOption('#home-theme', theme);
      await page.locator('#directions-uber').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('html').getAttribute('data-home-theme'), theme);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route}/${locale}/${width}/${theme}: horizontal overflow`);
      for (const selector of ['#directions-uber','#directions-waze','#directions-copy','.event-map-once','.event-map-preferences','#directions-map']) {
        const node = page.locator(selector);
        await node.evaluate(element => element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
        const box = await node.boundingBox();
        assert(box && box.height >= 44 && box.width >= 44, `${selector}: minimum touch target`);
        assert(box.x >= -1 && box.x + box.width <= width + 1, `${selector}: horizontal clipping`);
        assert(await node.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          return hit === element || element.contains(hit);
        }), `${route}/${locale}/${width}/${theme}/${selector}: center obscured by fixed chrome or another element`);
        const pair = await colors(node);
        const ratio = contrast(...pair);
        assert(ratio >= 4.5, `${selector}: text contrast ${ratio.toFixed(2)} for ${pair}`);
      }
      const wazeBounds = await page.locator('#directions-waze').boundingBox();
      const iconBounds = await page.locator('#directions-waze img.waze-mark').boundingBox();
      const labelBounds = await page.locator('#directions-waze-label').boundingBox();
      assert.equal(iconBounds.width, 28); assert.equal(iconBounds.height, 26);
      assert(iconBounds.x >= wazeBounds.x && iconBounds.y >= wazeBounds.y && iconBounds.x + iconBounds.width <= labelBounds.x && iconBounds.y + iconBounds.height <= wazeBounds.y + wazeBounds.height, 'Official icon fits beside generic event label');
      await page.locator('#directions-uber').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('#directions-waze')).toBeFocused();
      const focus = await page.locator('#directions-waze').evaluate(node => {
        const style = getComputedStyle(node); return {style:style.outlineStyle,width:parseFloat(style.outlineWidth)};
      });
      assert(focus.style !== 'none' && focus.width >= 2, 'Visible keyboard focus outline');
      const name = `${route}-${locale}-${width}-${theme}-directions.png`;
      await page.locator('#event-directions').screenshot({path:path.join(out,name)});
      result.screenshots.push(name);
      if (width === 320) {
        // Keep the full component capture and add reachable viewport evidence.
        // Fixed chrome remains unchanged and visible in both screenshots.
        for (const [part,selector] of [['upper-controls','.directions-actions'],['lower-consent','#directions-map-preview']]) {
          await page.locator(selector).evaluate(element => element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
          const viewportName = `${route}-${locale}-${width}-${theme}-${part}-viewport.png`;
          await page.screenshot({path:path.join(out,viewportName)});
          result.screenshots.push(viewportName);
        }
      }
    }
    result.checks.push('320/390/1440 layouts; light/dark; labels, keyboard focus, 44px targets, 4.5:1 action contrast, no horizontal overflow and reachable unobscured control centers');
    await page.setViewportSize({width:390,height:1100});
    await page.locator('#directions-copy').click();
    assert.equal(await page.evaluate(() => window.__CT_UNIVERSAL_COPIED__), await page.locator('#directions-address').inputValue());
    const originalUrl = page.url();
    await page.locator('#directions-waze').click();
    await page.locator('#directions-waze').focus();
    await page.keyboard.press('Enter');
    assert.equal(page.url(), originalUrl);
    assert.equal(external.filter(providerRequest).length, 0, 'Synthetic activation must not contact a provider');
    assert.equal(await page.evaluate(() => __CT_UNIVERSAL_FIXTURE_TRANSPORT__.outboundClicks.filter(item => item.id === 'directions-waze').length), 2);

    await page.locator('.event-map-once').focus();
    await page.keyboard.press('Enter');
    const firstFrame = await loadedMapAssertions(page, expect, point);
    await expect(page.locator('#directions-map-preview [role="status"]')).toBeFocused();
    assert.equal(await page.evaluate(() => CTPrivacy.allowed('maps')), false, 'One-time permission must not persist');
    // Wait until interception observes the initial blocked request. An iframe
    // with src already set does not establish that its request reached routing.
    await expect.poll(() => external.filter(entry => entry.hostname === 'maps.google.com').length).toBe(1);
    const requestsAfterOnce = external.filter(providerRequest).length;
    // A language-only update must preserve the actual iframe, its pin and grant.
    for (const next of Object.keys(locales)) {
      await page.selectOption('#event-language', next);
      await sharedPinAssertions(page, expect, fixture.thirdEvent, next);
      assert(await firstFrame.evaluate(node => node.isConnected), 'Language update recreated the iframe');
      assert.equal(external.filter(providerRequest).length, requestsAfterOnce, 'Language update requested another map');
    }
    await page.selectOption('#event-language', locale);
    await render(page, fixture.fourthEvent);
    const nextPoint = await sharedPinAssertions(page, expect, fixture.fourthEvent, locale);
    assert.equal(await page.locator('#directions-map-preview iframe').count(), 0, 'One-time consent inherited by another event');
    assert.equal(await firstFrame.getAttribute('src'), null, 'Old detached iframe still has src');
    assert.equal(external.filter(providerRequest).length, requestsAfterOnce, 'Another event requested map without consent');
    await expect(page.locator('.event-map-once')).toBeVisible();
    result.checks.push('copy, blocked repeated navigation, one-time map pin, language preserves iframe, one-time consent not inherited across events');

    await page.locator('.event-map-once').click();
    const secondFrame = await loadedMapAssertions(page, expect, nextPoint);
    await saveMapPermission(page, expect, true);
    await loadedMapAssertions(page, expect, nextPoint);
    await saveMapPermission(page, expect, false);
    assert.equal(await page.locator('#directions-map-preview iframe').count(), 0, 'Revoking permission must remove map iframe');
    assert.equal(await secondFrame.getAttribute('src'), null, 'Revoked detached iframe still has src');
    await expect(page.locator('.event-map-once')).toBeVisible();
    await sharedPinAssertions(page, expect, fixture.fourthEvent, locale);
    result.checks.push('real privacy dialog grant/revoke removes iframe and its src; navigation links stay available');

    for (const [description,event,requestedId] of [
      ['changed address', {...fixture.thirdEvent,endereco:'Outra Rua de QA, 999'},fixture.thirdEvent.id],
      ['explicitly revoked destination', {...fixture.thirdEvent,destinoTransporte:null},fixture.thirdEvent.id],
      ['unconfirmed destination', {...fixture.thirdEvent,destinoTransporte:{...fixture.thirdEvent.destinoTransporte,confirmed:false}},fixture.thirdEvent.id],
      ['online event without a pin', {...fixture.thirdEvent,local:'Online',endereco:'',destinoTransporte:null},fixture.thirdEvent.id],
      ['mismatched requested event',fixture.thirdEvent,fixture.fourthEvent.id]
    ]) {
      await render(page, fixture.thirdEvent);
      await page.locator('.event-map-once').click();
      const oldFrame = await loadedMapAssertions(page, expect, point);
      await render(page, event, requestedId);
      await clearAssertions(page, expect, description);
      assert.equal(await oldFrame.getAttribute('src'), null, `${description}: old iframe source retained`);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('ct:public-language'));
        dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
      });
      await clearAssertions(page, expect, `${description} after locale/BFCache events`);
    }
    result.checks.push('address changes, null/unconfirmed contracts, online event and requested-ID mismatch fail closed; no locale/BFCache resurrection');

    // Exercise this template's real loading path with a held synthetic response.
    await render(page, fixture.thirdEvent);
    await page.locator('.event-map-once').click();
    const loadingFrame = await loadedMapAssertions(page, expect, point);
    await page.evaluate(() => {__CT_UNIVERSAL_FIXTURE_TRANSPORT__.mode='hold';__CT_UNIVERSAL_TEMPLATE_HOOKS__.load();});
    await expect(page.locator('#loading')).toBeVisible();
    await clearAssertions(page, expect, 'actual template load start');
    assert.equal(await loadingFrame.getAttribute('src'), null);
    assert.equal(await page.evaluate(() => __CT_UNIVERSAL_FIXTURE_TRANSPORT__.held.length), 1);
    await page.evaluate(() => document.dispatchEvent(new Event('ct:public-language')));
    await clearAssertions(page, expect, 'loading after language update');
    await page.evaluate(() => __CT_UNIVERSAL_FIXTURE_TRANSPORT__.release('failure'));
    await expect(page.locator('#errorBox')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('#retryEventLoad')).toBeVisible();
    await clearAssertions(page, expect, 'actual RPC failure handler');
    // Retry through the real UI and verify a fresh destination but no carried grant.
    await page.locator('#retryEventLoad').click();
    await expect(page.locator('#app')).toBeVisible();
    await sharedPinAssertions(page, expect, fixture.thirdEvent, locale);
    assert.equal(await page.locator('#directions-map-preview iframe').count(), 0, 'Retry inherited stale one-time consent');
    await page.locator('.event-map-once').click();
    await loadedMapAssertions(page, expect, point);
    await page.evaluate(() => __CT_UNIVERSAL_TEMPLATE_HOOKS__.showError('Falha sintética para QA.', true));
    await clearAssertions(page, expect, 'actual showError closure');
    await page.evaluate(() => {
      document.dispatchEvent(new Event('ct:public-language'));
      dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    });
    await clearAssertions(page, expect, 'error after locale/BFCache events');
    result.checks.push('actual template load/error closures clear stale navigation, map and address; fixture RPC failure and UI retry verified');

    assert.deepEqual(localFailures, [], 'Unexpected local asset failures');
    assert.deepEqual(pageErrors, [], 'Browser page errors');
    assert.deepEqual(await page.evaluate(() => __CT_UNIVERSAL_FIXTURE_TRANSPORT__.blockedMethods), [], 'Unexpected operational methods');
    assert(external.every(entry => entry.blocked), 'Every external request must be aborted');
    assert(!external.some(entry => /(?:script\.google|googleusercontent|uber|waze)/.test(entry.hostname)), 'No real RPC or transport request may be attempted');
    result.passed = true;
  } catch (error) {
    result.passed = false;
    result.error = String(error.stack || error);
    if (page) {
      const name = `${route}-${locale}-failure.png`;
      try {await page.screenshot({path:path.join(out,name),fullPage:true});result.screenshots.push(name);} catch (_) {}
    }
  } finally {
    result.blockedExternalRequests = external;
    result.localFailures = localFailures;
    result.pageErrors = pageErrors;
    await context.close();
  }
}

async function main() {
  const staticResult = fixture.staticChecks();
  if (process.argv.includes('--static')) {
    console.log(JSON.stringify({mode:'static-only; no browser launched',...staticResult},null,2));
    return;
  }
  const {chromium,expect} = require('@playwright/test');
  fs.mkdirSync(out, {recursive:true});
  const report = {
    fixtureOnly:true, browserOffline:true, realBackendRpc:false, externalNetworkPermitted:false,
    templates:fixture.routes, locales:Object.keys(locales), widths, themes,
    sourceHashes:staticResult.fileHashes, scenarios:[], passed:false,
    limitations:['External maps are deliberately blocked; no claim of provider rendering, real-world pin accuracy, backend integration or production behavior.']
  };
  let browser;
  try {
    browser = await chromium.launch({
      proxy:{server:'http://127.0.0.1:9',bypass:'<-loopback>'},
      args:['--disable-background-networking','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']
    });
    for (const route of fixture.routes) for (const locale of Object.keys(locales)) {
      const result = {route,locale,checks:[],screenshots:[],passed:false};
      report.scenarios.push(result);
      await runCase(browser, expect, route, locale, result);
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${route}/${locale}: ${result.checks.length} check groups, ${result.screenshots.length} screenshots`);
      if (result.error) console.error(result.error);
    }
    assert.deepEqual(fixture.fingerprint(), report.sourceHashes, 'Candidate files changed during browser QA');
    report.candidateFilesUnchanged = true;
    report.passed = report.scenarios.length === 8 && report.scenarios.every(result => result.passed);
    assert(report.passed, 'One or more universal-directions browser scenarios failed; inspect report.json');
    console.log('PASS: generic shared destination in both actual templates; privacy, stale-state, responsive/accessibility fixture checks; all external network requests blocked.');
  } catch (error) {
    report.error = String(error.stack || error);
    throw error;
  } finally {
    fs.writeFileSync(path.join(out,'report.json'), JSON.stringify(report,null,2));
    if (browser) await browser.close();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
