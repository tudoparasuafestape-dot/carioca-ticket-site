const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { events, cover } = require('../fixtures/home-stage1.cjs');
const { capture } = require('./capture.cjs');
const ROOT = path.resolve(__dirname, '../..'), ORIGIN = 'http://127.0.0.1:4174';
const EVIDENCE = path.join(ROOT, 'docs/reviews/home-v1/screenshots');
const dictionaries = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/home-i18n.js'), 'utf8').match(/var dictionaries = (\{[\s\S]*?\n\});/)[1]);
test.use({ offline: true, serviceWorkers: 'block' });

async function fixture(page) {
  const state = { errors: [], blocked: [], methods: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.context().routeWebSocket('**/*', socket => { state.blocked.push('websocket'); socket.close(); });
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN && request.method() === 'GET') {
      if (url.pathname.startsWith('/__fixture/')) return route.fulfill({ contentType: 'image/svg+xml', body: cover(url.pathname.includes('music') ? 'music' : 'creative') });
      if (url.pathname === '/pwa-register.js' || url.pathname.includes('ct-analytics')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      const file = path.resolve(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'Fixture missing' });
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'image/png';
      return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    }
    const params = new URLSearchParams(request.postData() || '');
    if (url.origin === 'https://script.google.com' && request.method() === 'POST' && params.get('metodo') === 'ctEventosPublicosListarPROD' && params.get('argsJson') === '[]' && params.get('ctMinhaCariocaAction') === 'publicRpc') {
      state.methods.push(params.get('metodo'));
      const payload = { ctMinhaCariocaPost: true, id: params.get('ctMinhaCariocaRequestId'), ok: true, resultado: { sucesso: true, eventos: events } };
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<script>parent.postMessage(' + JSON.stringify(payload).replace(/</g, '\\u003c') + ', "*")</script>' });
    }
    state.blocked.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  await page.goto(ORIGIN);
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  return state;
}
function assertClean(state) {
  expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
  expect(state.methods).toEqual(['ctEventosPublicosListarPROD']);
}
async function headerFits(page) {
  const problems = await page.locator('.brand, .brand-location .location-trigger, .links a, .nav-tools select, .nav-tools button, .producer-top-link').evaluateAll(nodes => {
    const visible = nodes.filter(node => node.getClientRects().length && !node.closest('[hidden]')).map(node => ({ name: node.id || node.className || node.textContent.trim(), box: node.getBoundingClientRect() }));
    const problems = [];
    for (let i = 0; i < visible.length; i++) {
      const a = visible[i];
      if (a.box.left < -1 || a.box.right > innerWidth + 1) problems.push('outside: ' + a.name);
      for (let j = i + 1; j < visible.length; j++) {
        const b = visible[j];
        if (Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1) problems.push('overlap: ' + a.name + ' / ' + b.name);
      }
    }
    // The brand's text can paint outside its flex box when enlarged.
    // Measure the actual text fragments, not only the wrapper rectangle.
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.brand span'));
    for (const text of range.getClientRects()) for (const control of visible.filter(item => item.name !== 'brand')) {
      const box = control.box;
      if (Math.min(text.right, box.right) - Math.max(text.left, box.left) > 1 && Math.min(text.bottom, box.bottom) - Math.max(text.top, box.top) > 1) problems.push('brand text overlaps: ' + control.name);
    }
    return problems;
  });
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
const destinations = ['#todos-eventos', '/minha-carioca/conta/?v=20260919-2158', '#produtores', '/produtor/', '/parceiro/programa/', '#seguranca', '/ajuda/', '/sobre/'];

for (const width of [320, 412, 1200, 1201, 1440, 1920]) for (const theme of ['light', 'dark']) {
  test('organized navigation / ' + width + 'px / ' + theme, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const state = await fixture(page), button = page.locator('.menu-toggle'), menu = page.locator('#mobile-menu');
    await expect(button).toBeVisible(); await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveAccessibleName('Abrir menu');
    await expect(page.locator('.producer-top-link')).toBeVisible();
    await expect(page.locator('.producer-top-link')).toHaveAttribute('href', '/produtor/');
    await headerFits(page);
    if (width > 1200) {
      await expect(button.locator('.menu-label')).toBeVisible();
      await expect(page.locator('#accessibility-toggle .accessibility-label')).toHaveText('Idioma');
      await expect(page.locator('#accessibility-toggle .accessibility-label')).toBeVisible();
      await expect(page.locator('.links a')).toHaveText(['Explorar eventos', 'Meus ingressos', 'Entrar']);
      expect(await page.locator('.nav').evaluate(node => node.offsetHeight)).toBeLessThanOrEqual(100);
    } else await expect(page.locator('.links')).toBeHidden();
    await button.click(); await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toHaveAccessibleName('Menu de navegação');
    await expect(menu.locator('h2')).toHaveText(['Sua experiência', 'Para quem realiza', 'Conte com a gente']);
    expect(await menu.locator('a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual(destinations);
    const geometry = await menu.evaluate(node => {
      const box = node.getBoundingClientRect(), groups = Array.from(node.querySelectorAll('.menu-group'), group => group.getBoundingClientRect().toJSON());
      return { left: box.left, right: box.right, bottom: box.bottom, height: box.height, groups, viewport: innerHeight };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport);
    if (width > 1200) expect(new Set(geometry.groups.map(group => Math.round(group.top))).size).toBe(1);
    await capture(page, path.join(EVIDENCE, 'navigation-' + theme + '-' + width + '.png'));
    await page.keyboard.press('Escape'); await expect(menu).toBeHidden(); await expect(button).toBeFocused();
    assertClean(state);
  });
}

for (const width of [320, 1200, 1201, 1440, 1920]) {
  test('keyboard traversal, repeat and dismissal / ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page), button = page.locator('.menu-toggle'), menu = page.locator('#mobile-menu'), links = menu.locator('a');
    await button.focus(); await button.press('Enter'); await page.keyboard.press('Tab');
    await expect(links.first()).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(button).toBeFocused();
    await page.keyboard.press('Tab');
    for (let i = 0; i < destinations.length; i++) { await expect(links.nth(i)).toBeFocused(); await page.keyboard.press('Tab'); }
    await expect(menu).toBeHidden(); await expect(page.locator('.producer-top-link')).toBeFocused();
    await button.click(); await button.click(); await expect(menu).toBeHidden();
    await button.click(); await page.mouse.click(2, 2); await expect(menu).toBeHidden();
    await button.click(); await links.first().focus(); await page.keyboard.press('Escape'); await expect(button).toBeFocused();
    await button.click(); await page.locator('#accessibility-toggle').click();
    await expect(menu).toBeHidden(); await expect(page.locator('#home-accessibility')).toBeVisible();
    await button.click(); await expect(page.locator('#home-accessibility')).toBeHidden();
    await page.locator('.brand-location .location-trigger').click();
    await expect(menu).toBeHidden(); await expect(page.locator('#location-dialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('#location-dialog')).toBeHidden();
    assertClean(state);
  });
}

test('crossing 1200/1201 in both directions returns focus to the still-visible menu button', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const state = await fixture(page), button = page.locator('.menu-toggle'), menu = page.locator('#mobile-menu');
  for (const width of [1201, 1200, 1440, 412, 1920]) {
    await button.click(); await menu.locator('a').first().focus();
    await page.setViewportSize({ width, height: 900 });
    await expect(menu).toBeHidden(); await expect(button).toBeVisible(); await expect(button).toBeFocused();
    await headerFits(page);
  }
  assertClean(state);
});

test('anchor navigation and browser back close the disclosure without trapping focus', async ({ page }) => {
  const state = await fixture(page), button = page.locator('.menu-toggle'), menu = page.locator('#mobile-menu');
  await button.click(); await menu.locator('a[href="#produtores"]').click();
  await expect(page).toHaveURL(ORIGIN + '/#produtores');
  await expect(page.locator('#produtores')).toBeFocused(); await expect(menu).toBeHidden();
  await button.click(); await menu.locator('a[href="#seguranca"]').click();
  await expect(page).toHaveURL(ORIGIN + '/#seguranca');
  await button.click(); await menu.locator('a').first().focus();
  await page.goBack(); await expect(page).toHaveURL(ORIGIN + '/#produtores');
  await expect(menu).toBeHidden(); await expect(page.locator('#produtores')).toBeFocused();
  await button.click(); await expect(menu.locator('a[href="#produtores"]')).toHaveAttribute('aria-current', 'location');
  await page.goForward(); await expect(page).toHaveURL(ORIGIN + '/#seguranca'); await expect(menu).toBeHidden();
  await expect(page.locator('#seguranca')).toBeFocused();
  assertClean(state);
});

for (const width of [320, 412, 1201, 1351, 1440, 1920]) for (const locale of ['pt-BR', 'en-US', 'es', 'zh-Hans']) {
  test('translated menu supports 150 percent text / ' + width + 'px / ' + locale, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(value => localStorage.setItem('ct-home-locale', value), locale);
    const state = await fixture(page), dictionary = dictionaries[locale], button = page.locator('.menu-toggle'), menu = page.locator('#mobile-menu');
    await expect(button.locator('.menu-label')).toHaveText(dictionary.menuLabel);
    await expect(button).toHaveAccessibleName(dictionary.openMenu);
    await expect(page.locator('#accessibility-toggle')).toHaveAccessibleName(dictionary.accessibility);
    await expect(page.locator('#accessibility-toggle .accessibility-label')).toHaveText(dictionary.language);
    await expect(page.locator('#home-language')).toHaveCount(1);
    await headerFits(page);
    await page.locator('#accessibility-toggle').click();
    await expect(page.locator('#home-language')).toBeVisible();
    expect(await page.locator('#home-language option').evaluateAll(nodes => nodes.map(node => node.value))).toEqual(['pt-BR', 'en-US', 'es', 'zh-Hans']);
    for (let i = 0; i < 5; i++) await page.locator('#font-up').click();
    await button.click();
    await expect(button).toHaveAccessibleName(dictionary.closeMenu);
    await expect(menu).toHaveAccessibleName(dictionary.mobileNavigation);
    await headerFits(page);
    await capture(page, path.join(EVIDENCE, 'navigation-text150-' + locale + '-' + width + '.png'));
    await menu.locator('a').last().focus(); await expect(menu.locator('a').last()).toBeFocused();
    expect(await menu.evaluate(node => node.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
    await page.keyboard.press('Tab'); await expect(page.locator('.producer-top-link')).toBeFocused();
    assertClean(state);
  });
}

test.describe('navigation at equivalent 200 percent browser zoom', () => {
  test.use({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 });
  for (const theme of ['light', 'dark']) test('menu and language remain reachable / ' + theme, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const state = await fixture(page), button = page.locator('.menu-toggle'), menu = page.locator('#mobile-menu');
    await headerFits(page);
    await page.locator('#accessibility-toggle').click();
    await expect(page.locator('#home-language')).toBeInViewport();
    await page.locator('#home-language').selectOption('en-US');
    await expect(button).toHaveAccessibleName(dictionaries['en-US'].openMenu);
    await page.keyboard.press('Escape'); await expect(page.locator('#accessibility-toggle')).toBeFocused();
    await button.focus(); await button.press('Enter'); await page.keyboard.press('Tab');
    for (let i = 0; i < destinations.length; i++) {
      await expect(menu.locator('a').nth(i)).toBeFocused();
      await expect(menu.locator('a').nth(i)).toBeInViewport();
      if (i < destinations.length - 1) await page.keyboard.press('Tab');
    }
    await capture(page, path.join(EVIDENCE, 'navigation-zoom200-' + theme + '.png'));
    await page.keyboard.press('Tab'); await expect(menu).toBeHidden(); await expect(page.locator('.producer-top-link')).toBeFocused();
    await headerFits(page);
    assertClean(state);
  });
});
