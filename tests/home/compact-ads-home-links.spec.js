const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./rail-fixture.cjs');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:4174';
const MESSAGE = 'Olá! Vim pela Carioca Ticket e gostaria de mais informações sobre os serviços e horários disponíveis para agendamento.';
test.use({ offline: true, serviceWorkers: 'block' });

async function campaign(slot) {
  await slot.scrollIntoViewIfNeeded();
  await slot.locator('.ad-controls button').first().focus();
  if (!(await slot.locator('.ad-campaign').isVisible())) await slot.locator('.ad-controls button').last().click();
  await expect(slot.locator('.ad-campaign')).toBeVisible();
  await expect.poll(() => slot.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
}

for (const width of [320, 768, 1000, 1440]) for (const theme of ['light', 'dark']) {
  test(`compact advertisements keep whole artwork and stable slides / ${width} / ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(theme => localStorage.setItem('ct-home-theme', theme), theme);
    const state = await fixture(page, { random: 0.9 });
    for (const locale of ['pt-BR', 'en-US', 'es', 'zh-Hans']) {
      await page.evaluate(locale => CTHome.setLocale(locale), locale);
      for (const name of ['primary', 'secondary']) {
        const slot = page.locator('#advertising-' + name);
        await campaign(slot);
        const before = await slot.boundingBox();
        const geometry = await slot.locator('.ad-campaign').evaluate(link => {
          const img = link.querySelector('img'), caption = link.querySelector('.ad-caption');
          const i = img.getBoundingClientRect(), c = caption.getBoundingClientRect();
          return { ratio: i.width / i.height, naturalRatio: img.naturalWidth / img.naturalHeight,
            fit: getComputedStyle(img).objectFit, sideBySide: c.left >= i.right - 1,
            stacked: c.top >= i.bottom - 1, captionFits: caption.scrollWidth <= caption.clientWidth,
            documentFits: document.documentElement.scrollWidth <= innerWidth + 1 };
        });
        expect(geometry.ratio).toBeCloseTo(geometry.naturalRatio, 2);
        expect(geometry.fit).toBe('contain');
        expect(geometry.captionFits && geometry.documentFits).toBe(true);
        expect(width >= 1000 ? geometry.sideBySide : geometry.stacked).toBe(true);
        if (locale === 'pt-BR' || locale === 'en-US') await slot.screenshot({ path: testInfo.outputPath(`ad-${name}-${width}-${theme}-${locale}.png`) });
        await slot.locator('.ad-controls button').last().click();
        await expect(slot.locator('.ad-house')).toBeVisible();
        const house = await slot.boundingBox();
        expect(Math.abs(before.height - house.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(before.y - house.y)).toBeLessThanOrEqual(1);
        await slot.locator('.ad-controls button').last().click();
        expect(Math.abs(before.height - (await slot.boundingBox()).height)).toBeLessThanOrEqual(1);
      }
      const url = new URL(await page.locator('#advertising-secondary .ad-campaign').getAttribute('href'));
      expect(url.origin + url.pathname).toBe('https://wa.me/5581996200696');
      expect([...url.searchParams.keys()]).toEqual(['text']);
      expect(url.searchParams.get('text')).toBe(MESSAGE);
      await expect(page.locator('#advertising-secondary .ad-campaign')).toHaveAttribute('target', '_blank');
      await expect(page.locator('#advertising-secondary .ad-campaign')).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(page.context().pages()).toHaveLength(1);
    expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  });
}

test('desktop compact height comparison and enlarged text reflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const state = await fixture(page);
  const measurements = [];
  for (const name of ['primary', 'secondary']) {
    const slot = page.locator('#advertising-' + name);
    await campaign(slot);
    const compact = await slot.boundingBox();
    await slot.screenshot({ path: testInfo.outputPath(name + '-compact-after.png') });
    // Reconstruct only the previous stacked composition using the same artwork and copy.
    const baseline = await page.addStyleTag({ content: '.ct-home .ad-stage > .ad-campaign,.ct-home .ad-stage > .ad-campaign[hidden]{display:block!important;}' });
    const stacked = await slot.boundingBox();
    await slot.screenshot({ path: testInfo.outputPath(name + '-stacked-before.png') });
    await baseline.evaluate(el => el.remove());
    expect(compact.height).toBeLessThan(stacked.height * 0.8);
    measurements.push({ name, compactHeight: compact.height, previousStackedHeight: stacked.height });
  }
  await testInfo.attach('desktop-height-comparison', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  await page.evaluate(() => document.documentElement.style.setProperty('--home-font-scale', '1.5'));
  for (const width of [1440, 1000, 720, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const name of ['primary', 'secondary']) {
      const slot = page.locator('#advertising-' + name);
      await campaign(slot);
      expect(await slot.evaluate(el => [...el.querySelectorAll('.ad-caption,.ad-controls')].every(n => n.scrollWidth <= n.clientWidth + 1))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const before = (await slot.boundingBox()).height;
      await slot.locator('.ad-controls button').last().click();
      expect(Math.abs(before - (await slot.boundingBox()).height)).toBeLessThanOrEqual(1);
      await slot.screenshot({ path: testInfo.outputPath(`ad-${name}-${width}-text150.png`) });
    }
  }
  expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
});

for (const width of [320, 1440]) test(`home footer logo is native keyboard home navigation / ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await fixture(page);
  const link = page.locator('.footer-home-link');
  await expect(link).toHaveAttribute('href', '/');
  await expect(link).toHaveAccessibleName('Carioca Ticket');
  await link.focus(); await expect(link).toBeFocused();
  expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await link.press('Enter');
  await expect(page).toHaveURL(ORIGIN + '/');
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
});

for (const width of [320, 1440]) test(`producer logos have native home navigation without auth scripts / ${width}`, async ({ page }, testInfo) => {
  // This tests exact production markup/CSS and native links; no auth or RPC is executed.
  const html = fs.readFileSync(path.join(ROOT, 'produtor/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const blocked = [];
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && route.request().method() === 'GET') {
      if (url.pathname === '/produtor/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<title>Home fixture</title><h1>Home fixture</h1>' });
      const file = path.resolve(ROOT, '.' + url.pathname);
      if (file.startsWith(ROOT + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.png') ? 'image/png' : 'text/plain' });
    }
    blocked.push(route.request().method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  await page.setViewportSize({ width, height: 1000 });
  for (const view of ['login', 'register', 'portal']) {
    await page.goto(ORIGIN + '/produtor/');
    await page.evaluate(view => {
      sessionStorage.setItem('native-logo-navigation-sentinel', 'unchanged');
      document.querySelector('#loginView').classList.toggle('hidden', view === 'portal');
      document.querySelector('#portalView').classList.toggle('hidden', view !== 'portal');
      document.querySelector('#loginAuthView').classList.toggle('hidden', view === 'register');
      document.querySelector('#registerAuthView').classList.toggle('hidden', view !== 'register');
    }, view);
    const link = page.locator(view === 'portal' ? '.top-logo-box' : '#brandLogoBox');
    await expect(link).toHaveAttribute('href', '/');
    await expect(link).toHaveAccessibleName('Carioca Ticket — página inicial');
    expect(await link.evaluate(el => el.tagName)).toBe('A');
    await link.focus(); await expect(link).toBeFocused();
    expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.screenshot({ path: testInfo.outputPath(`producer-${view}-${width}.png`) });
    if (view === 'register') await link.click(); else await link.press('Enter');
    await expect(page).toHaveURL(ORIGIN + '/');
    expect(await page.evaluate(() => sessionStorage.getItem('native-logo-navigation-sentinel'))).toBe('unchanged');
    await page.goBack();
    await expect(page).toHaveURL(ORIGIN + '/produtor/');
  }
  expect(blocked).toEqual([]);
});
