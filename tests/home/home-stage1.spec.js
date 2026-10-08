const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { events, cover } = require('../fixtures/home-stage1.cjs');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:4174';
const EVIDENCE = path.join(ROOT, 'docs/reviews/home-stage1/screenshots');

async function fixture(page, options = {}) {
  const state = { methods: [], errors: [], blocked: [], attempts: 0 };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN && request.method() === 'GET') {
      if (url.pathname.startsWith('/__fixture/')) return route.fulfill({ contentType: 'image/svg+xml', body: cover(url.pathname.includes('music') ? 'music' : 'creative') });
      if (url.pathname === '/pwa-register.js' || url.pathname.includes('ct-analytics')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      const file = path.resolve(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'Fixture missing' });
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'image/png';
      return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    }
    const params = new URLSearchParams(request.postData() || '');
    if (url.origin === 'https://script.google.com' && request.method() === 'POST' && params.get('metodo') === 'ctEventosPublicosListarPROD' && params.get('argsJson') === '[]' && params.get('ctMinhaCariocaAction') === 'publicRpc') {
      state.methods.push(params.get('metodo'));
      state.attempts++;
      const result = typeof options.result === 'function' ? options.result(state.attempts) : options.result;
      const payload = { ctMinhaCariocaPost: true, id: params.get('ctMinhaCariocaRequestId'), ok: true, resultado: result || { sucesso: true, eventos: events } };
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<script>parent.postMessage(${JSON.stringify(payload).replace(/</g, '\\u003c')}, '*')</script>` });
    }
    state.blocked.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  return state;
}
async function loaded(page) { await expect(page.locator('.catalog-card')).toHaveCount(2); }
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const outside = await page.locator('main a, main input, main button, header select').evaluateAll(nodes => nodes.filter(node => {
    if (!node.getClientRects().length) return false;
    const rect = node.getBoundingClientRect();
    return rect.left < -1 || rect.right > innerWidth + 1;
  }).map(node => node.textContent || node.id));
  expect(outside).toEqual([]);
}
async function screenshot(page, name, fullPage = false) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await expect.poll(() => page.locator('img').evaluateAll(images => images.every(img => img.complete))).toBe(true);
  const viewport = page.viewportSize();
  // Paint the entire document before capture: some headless builds omit offscreen
  // decorative text/images from full-page screenshots despite complete assets.
  if (fullPage) await page.setViewportSize({ ...viewport, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  try {
    await page.screenshot({ path: path.join(EVIDENCE, name + '.png'), fullPage });
  } finally {
    if (fullPage) await page.setViewportSize(viewport);
  }
}

test('initial system theme, live system changes, explicit override and persistence', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await fixture(page);
  await loaded(page);
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'light');
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('dark');
  await page.getByLabel('Tema', { exact: true }).selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('ct-home-theme'))).toBeNull();
  expect(state.errors).toEqual([]);
  expect(state.blocked).toEqual([]);
});

test('unavailable storage and invalid saved values do not block theme or catalog', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  const state = await fixture(page);
  await loaded(page);
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  expect(state.errors).toEqual([]);
});

test('invalid saved theme follows system and storage write failures retain the explicit choice', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ct-home-theme', 'invalid');
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await fixture(page);
  await loaded(page);
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  await page.getByLabel('Tema', { exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'light');
  expect(state.errors).toEqual([]);
});

test('search and location intersect without extra RPC, and clearing restores the catalog', async ({ page }) => {
  const state = await fixture(page);
  await loaded(page);
  await page.getByLabel('Pesquisar eventos').fill('MUSICA');
  await page.getByLabel('Cidade ou local').fill('outra cidade');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.locator('#no-events')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click();
  await loaded(page);
  await expect(page.getByLabel('Pesquisar eventos')).toBeFocused();
  await expect(page.getByLabel('Cidade ou local')).toHaveValue('');
  await page.getByLabel('Cidade ou local').fill('ESPACO');
  await page.getByLabel('Cidade ou local').press('Enter');
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await expect(page.locator('.catalog-card')).toContainText(events[0].nome);
  expect(state.methods).toEqual(['ctEventosPublicosListarPROD']);
  expect(state.errors).toEqual([]);
});

test('keyboard skip link, mobile disclosure, escape, anchor focus and resizing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await fixture(page);
  await loaded(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para os eventos' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const button = page.getByRole('button', { name: 'Abrir menu' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mobile-menu')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#mobile-menu a').first()).toBeFocused();
  expect(await page.locator('#mobile-menu a').first().evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  await expect(page.locator('#mobile-menu')).toBeHidden();
  await button.press('Enter');
  await page.locator('#mobile-menu a[href="#produtores"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#produtores')).toBeFocused();
  await expect(page.locator('#mobile-menu')).toBeHidden();
  await button.press('Enter');
  await page.locator('#mobile-menu a').first().focus();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#mobile-menu')).toBeHidden();
  await expect(page.locator('.links a').first()).toBeFocused();
});

for (const theme of ['light', 'dark']) {
  for (const width of [320, 412, 768, 1440]) {
    test(`layout ${width}px / ${theme}, complete fields, covers and actions`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 1050 : 915 });
      await page.emulateMedia({ colorScheme: theme });
      const state = await fixture(page);
      await loaded(page);
      await noOverflow(page);
      await expect(page.getByLabel('Cidade ou local')).toBeVisible();
      await expect(page.getByLabel('Pesquisar eventos')).toBeVisible();
      for (const event of events) {
        const card = page.locator(`[data-event-id="${event.id}"]`);
        for (const field of ['nome', 'data', 'horario', 'local', 'cidade', 'uf']) await expect(card).toContainText(event[field]);
        await expect(card.getByRole('link', { name: 'Ver evento', exact: true })).toHaveAttribute('href', '/evento/?evento=' + event.id);
        await expect(card.getByRole('link', { name: 'Comprar ingresso: ' + event.nome })).toHaveAttribute('href', '/checkout/?evento=' + event.id);
        expect(await card.locator('img').evaluate(img => getComputedStyle(img).objectFit)).toBe('contain');
      }
      await expect(page.locator('.catalog-card')).not.toContainText(['R$']);
      expect(state.errors).toEqual([]);
      expect(state.blocked).toEqual([]);
      if (width === 1440 || width === 320) await screenshot(page, `${theme}-${width}`, true);
    });
  }
}

test('200% layout reflow and text enlargement keep controls reachable', async ({ page, browser }) => {
  // 1440px physical window at 200% gives a 720 CSS-pixel layout viewport.
  const context = await browser.newContext({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'light' });
  const zoomPage = await context.newPage();
  await fixture(zoomPage);
  await loaded(zoomPage);
  await noOverflow(zoomPage);
  await zoomPage.getByLabel('Cidade ou local').fill('cidade');
  await zoomPage.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await loaded(zoomPage);
  await screenshot(zoomPage, 'reflow-200-percent');
  await context.close();
  await fixture(page);
  await loaded(page);
  // Additional CSS zoom check; separate from the equivalent browser-zoom reflow above.
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await noOverflow(page);
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
});

test('empty/error/retry and missing metadata never fabricate event facts', async ({ page }) => {
  const state = await fixture(page, { result: attempt => attempt === 1 ? { sucesso: false } : { sucesso: true, eventos: [] } });
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await screenshot(page, 'catalog-error');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('#catalog-status')).toContainText('Nenhum evento disponível no momento');
  await expect(page.locator('#catalog-retry')).toBeHidden();
  expect(state.methods).toHaveLength(2);
});

test('missing and broken images have usable fallbacks and absent fields remain explicit', async ({ page }) => {
  await fixture(page, { result: { sucesso: true, eventos: [
    { id: 'PREVIEW-UNKNOWN', nome: 'Informações incompletas — fixture' },
    { ...events[0], visual: { capaUrl: '/missing.png' } }
  ] } });
  await loaded(page);
  await expect(page.locator('.catalog-image-fallback')).toHaveText(['Capa indisponível', 'Capa indisponível']);
  await expect(page.locator('.catalog-card').first()).toContainText('Data e horário não informados');
  await expect(page.locator('.catalog-card').first()).toContainText('Local não informado');
  await expect(page.getByRole('link', { name: /^Comprar ingresso:/ })).toHaveCount(2);
  await screenshot(page, 'missing-data');
});

test('existing home destinations and the public transport contract remain unchanged', async ({ page }) => {
  const baseline = execFileSync('git', ['show', 'edcfe04d:index.html'], { cwd: ROOT, encoding: 'utf8' });
  const hrefs = [...baseline.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
  await fixture(page);
  await loaded(page);
  const actual = await page.locator('a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  expect([...new Set(hrefs)].filter(href => !actual.includes(href))).toEqual([]);
  const oldCatalog = execFileSync('git', ['show', 'edcfe04d:assets/public-event-catalog.js'], { cwd: ROOT, encoding: 'utf8' }).replace(/\r\n/g, '\n');
  const catalog = fs.readFileSync(path.join(ROOT, 'assets/public-event-catalog.js'), 'utf8').replace(/\r\n/g, '\n');
  const marker = '  // Reuse the public POST/iframe bridge';
  expect(catalog.slice(catalog.indexOf(marker))).toBe(oldCatalog.slice(oldCatalog.indexOf(marker)));
  expect(fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\r\n/g, '\n')).toBe(execFileSync('git', ['show', 'edcfe04d:styles.css'], { cwd: ROOT, encoding: 'utf8' }).replace(/\r\n/g, '\n'));
});

test('light and dark text, buttons and focus rings meet contrast targets', async ({ page }) => {
  await fixture(page);
  await loaded(page);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Tema', { exact: true }).selectOption(theme);
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      function luminance(name) {
        const hex = style.getPropertyValue(name).trim().replace('#', '');
        const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
        const values = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
      }
      function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
      return {
        text: contrast('--home-text', '--home-bg'),
        muted: Math.min(...['--home-bg', '--home-surface', '--home-soft'].map(bg => contrast('--home-muted', bg))),
        button: contrast('--home-ink', '--home-accent'),
        focus: Math.min(...['--home-bg', '--home-surface', '--home-soft'].map(bg => contrast('--home-focus', bg)))
      };
    });
    expect(ratios.text).toBeGreaterThanOrEqual(4.5);
    expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
    expect(ratios.button).toBeGreaterThanOrEqual(4.5);
    expect(ratios.focus).toBeGreaterThanOrEqual(3);
  }
});

test('without JavaScript the home gives a recovery destination and hides script-only controls', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', colorScheme: 'dark' });
  const page = await context.newPage();
  await fixture(page);
  await expect(page.locator('noscript p')).toContainText('Ative o JavaScript');
  await expect(page.locator('noscript a')).toHaveAttribute('href', '/ajuda/');
  await expect(page.locator('.theme-control')).toBeHidden();
  await expect(page.locator('.menu-toggle')).toBeHidden();
  await expect(page.locator('#event-search-form')).toBeHidden();
  await expect(page.locator('#producerPortalCta')).toBeVisible();
  await context.close();
});
