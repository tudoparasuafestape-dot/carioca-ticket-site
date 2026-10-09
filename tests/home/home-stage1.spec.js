const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { events, cover } = require('../fixtures/home-stage1.cjs');
const { capture } = require('./capture.cjs');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:4174';
const EVIDENCE = path.join(ROOT, 'docs/reviews/home-v1/screenshots');
const i18nSource = fs.readFileSync(path.join(ROOT, 'assets/home-i18n.js'), 'utf8');
const dictionaries = JSON.parse(i18nSource.match(/var dictionaries = (\{[\s\S]*?\n\});/)[1]);
const approvedAds = [
  { slot: 'primary', name: 'tpssf', width: 2172, height: 724, title: 'Tudo Para Sua Festa',
    href: 'https://wa.me/5581995023085?text=Ol%C3%A1%21%20Vim%20pela%20Carioca%20Ticket%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20loca%C3%A7%C3%A3o%20de%20materiais%20para%20festas.', cta: 'Fale sobre locação pelo WhatsApp',
    sha256: '4714a8243dc0f61dd565390a54c98734c40864eb5d25f885a8cc2092edcc28c9' },
  { slot: 'secondary', name: 'priscila', width: 2170, height: 725, title: 'Priscila Ferreira',
    href: 'https://wa.me/5581996200696?text=Ol%C3%A1%21%20Vim%20pela%20Carioca%20Ticket%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20os%20servi%C3%A7os%20e%20hor%C3%A1rios%20dispon%C3%ADveis%20para%20agendamento.', cta: 'Clique aqui e faça seu agendamento',
    sha256: '0695b960e396903f73a72b24dfc97fdc63678889f32dee47a9e4c2ab0254bdaa' }
];

async function fixture(page, options = {}) {
  await page.addInitScript(() => { Math.random = () => 0; });
  const state = { methods: [], errors: [], blocked: [], attempts: 0, cities: 0 };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN && request.method() === 'GET') {
      if (options.missingAds && /home-ad-(tpssf|priscila)\.png$/.test(url.pathname)) return route.fulfill({ status: 404, body: 'Missing approved artwork fixture' });
      if (options.noControls && url.pathname.endsWith('home-controls.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (url.pathname.endsWith('home-municipalities.json')) { state.cities++; if (options.cityFailure && state.cities === 1) return route.fulfill({ status: 503, body: 'Unavailable fixture' }); }
      if (url.pathname.startsWith('/__fixture/')) return route.fulfill({ contentType: 'image/svg+xml', body: cover(url.pathname.includes('music') ? 'music' : 'creative') });
      if (url.pathname === '/pwa-register.js' || url.pathname.includes('ct-analytics')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (options.missingTranslation && url.pathname === '/assets/home-i18n.js') {
        const reduced = JSON.parse(JSON.stringify(dictionaries));
        delete reduced['en-US'].mobileNavigation;
        return route.fulfill({ contentType: 'text/javascript', body: i18nSource.replace(/var dictionaries = (\{[\s\S]*?\n\});/, 'var dictionaries = ' + JSON.stringify(reduced) + ';') });
      }
      const file = path.resolve(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'Fixture missing' });
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'image/png';
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
    if (!node.getClientRects().length || node.closest('.catalog-card[inert]')) return false;
    const rect = node.getBoundingClientRect();
    return rect.left < -1 || rect.right > innerWidth + 1;
  }).map(node => node.textContent || node.id));
  expect(outside).toEqual([]);
}
async function screenshot(page, name, fullPage = false) {
  await capture(page, path.join(EVIDENCE, name + '.png'), fullPage);
}

test('initial dark theme, explicit system changes and preference persistence', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await fixture(page);
  await loaded(page);
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'dark');
  await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('dark');
  await page.getByLabel('Tema', { exact: true }).selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('ct-home-theme'))).toBe('system');
  await page.reload();
  await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('data-home-theme', 'light');
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

test('invalid saved theme defaults dark and storage write failures retain the explicit choice', async ({ page }) => {
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

async function chooseCity(page, state, city) {
  await page.getByLabel('Cidade ou local', { exact: true }).click();
  await page.locator('#location-uf').selectOption(state);
  await expect(page.locator('#city-search')).toBeEnabled();
  await page.locator('#city-search').fill(city);
  await page.locator('#city-options').getByRole('button', { name: city, exact: true }).click();
  await page.locator('#location-apply').click();
}
test('search and official location intersect without extra RPC, and clearing restores the catalog', async ({ page }) => {
  const state = await fixture(page);
  await loaded(page);
  expect(state.cities).toBe(0);
  await chooseCity(page, 'PE', 'Caruaru');
  await page.getByLabel('Pesquisar eventos').fill('MUSICA');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.locator('#no-events')).toBeVisible();
  await expect(page.locator('.active-place')).toHaveText('Caruaru / PE');
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click();
  await loaded(page);
  await expect(page.getByLabel('Pesquisar eventos')).toBeFocused();
  await expect(page.getByLabel('Cidade ou local')).toHaveValue('Todos os lugares');
  await chooseCity(page, 'PE', 'Recife');
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await expect(page.locator('.catalog-card')).toContainText(events[0].nome);
  expect(state.methods).toEqual(['ctEventosPublicosListarPROD']);
  expect(state.cities).toBe(1);
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
  await expect(button).toBeFocused();
});

for (const theme of ['light', 'dark']) {
  for (const width of [320, 412, 768, 1440]) {
    test(`layout ${width}px / ${theme}, complete fields, covers and actions`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 1050 : 915 });
      await page.addInitScript(value => localStorage.setItem('ct-home-theme', value), theme);
      await page.emulateMedia({ colorScheme: theme });
      const state = await fixture(page);
      await loaded(page);
      await noOverflow(page);
      await expect(page.getByLabel('Cidade ou local')).toBeVisible();
      await expect(page.getByLabel('Pesquisar eventos')).toBeVisible();
      for (const event of events) {
        const card = page.locator(`[data-event-id="${event.id}"]`);
        for (const field of ['nome', 'data', 'horario', 'local', 'cidade', 'uf']) await expect(card).toContainText(event[field]);
        await expect(card.getByRole('link', { name: 'Ver evento', exact: true, includeHidden: true })).toHaveAttribute('href', '/evento/?evento=' + event.id);
        await expect(card.getByRole('link', { name: 'Comprar ingresso: ' + event.nome, includeHidden: true })).toHaveAttribute('href', '/checkout/?evento=' + event.id);
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
  await zoomPage.getByLabel('Pesquisar eventos').fill('demonstração');
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
  await expect(page.locator('.catalog-actions .btn-primary')).toHaveCount(2);
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

for (const locale of ['pt-BR', 'en-US', 'es', 'zh-Hans']) {
  for (const width of [320, 1440]) {
    test(`interface ${locale} at ${width}px keeps producer facts and navigation`, async ({ page }) => {
      await page.setViewportSize({ width, height: 915 });
      const state = await fixture(page);
      await loaded(page);
      await page.locator('#accessibility-toggle').click();
      await page.locator('#home-language').selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('#home-language')).toHaveValue(locale);
      const heading = await page.locator('h1').textContent();
      expect(heading).not.toBe('headline');
      if (locale !== 'pt-BR') expect(heading).not.toContain('Seu próximo');
      for (const event of events) {
        const card = page.locator(`[data-event-id="${event.id}"]`);
        for (const field of ['nome', 'data', 'horario', 'local', 'cidade', 'uf']) await expect(card).toContainText(event[field]);
        await expect(card.locator('.catalog-description')).toHaveText(event.visual.descricaoCurta);
        await expect(card.locator('.btn-primary')).toHaveAttribute('href', `/checkout/?evento=${event.id}`);
      }
      await noOverflow(page);
      expect(state.methods).toHaveLength(1);
      await page.locator('#accessibility-toggle').click();
      if (width === 320) {
        await page.locator('.menu-toggle').click();
        await expect(page.locator('#mobile-menu')).toBeVisible();
        const texts = await page.locator('[data-i18n]').evaluateAll(nodes => nodes.filter(n => n.textContent === n.dataset.i18n).map(n => n.dataset.i18n));
        expect(texts).toEqual([]);
        await screenshot(page, `language-${locale}-menu-320`);
      }
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      expect(state.errors).toEqual([]);
      expect(state.blocked).toEqual([]);
    });
  }
}

test('official interior city is selected, arbitrary text cannot apply, saved city is verified', async ({ page }) => {
  const state = await fixture(page);
  await loaded(page);
  await page.locator('.brand-location .location-trigger').click();
  await page.locator('#location-uf').selectOption('PE');
  await expect(page.locator('#city-search')).toBeEnabled();
  await page.locator('#city-search').fill('cidade que não existe');
  await expect(page.locator('#location-apply')).toBeDisabled();
  await expect(page.locator('#location-status')).toContainText('Nenhuma cidade');
  await page.locator('#city-search').fill('Caruaru');
  await expect(page.locator('#location-apply')).toBeDisabled();
  await page.getByRole('button', { name: 'Caruaru', exact: true }).click();
  await expect(page.locator('#location-apply')).toBeEnabled();
  await page.locator('#location-apply').click();
  await expect(page.locator('.active-place')).toHaveText('Caruaru / PE');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ct-home-location')));
  expect(saved).toEqual({ id: '2604106', uf: 'PE', name: 'Caruaru' });
  await page.reload();
  await expect(page.locator('.active-place')).toHaveText('Caruaru / PE');
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  expect(state.errors).toEqual([]);
});

test('city list error recovers locally and all preferences work with unavailable storage', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } }); });
  const state = await fixture(page, { cityFailure: true });
  await loaded(page);
  await page.getByLabel('Cidade ou local').click();
  await expect(page.locator('#location-retry')).toBeVisible();
  await page.locator('#location-retry').click();
  await page.locator('#location-uf').selectOption('PE');
  await expect(page.locator('#city-search')).toBeEnabled();
  await page.locator('#city-search').fill('Recife');
  await page.getByRole('button', { name: 'Recife', exact: true }).click();
  await page.locator('#location-apply').click();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await page.locator('#accessibility-toggle').click();
  await page.locator('#home-language').selectOption('en-US');
  await page.locator('#font-up').click();
  await expect(page.locator('#font-reset')).toHaveText('110%');
  expect(state.cities).toBe(2);
  expect(state.errors).toEqual([]);
});

test('periods show concrete dates, categories preserve location and empty results preserve controls', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-12-20T12:00:00Z') });
  const state = await fixture(page);
  await loaded(page);
  await page.locator('#filters-toggle').click();
  await page.locator('[data-period="week"]').click();
  await loaded(page);
  await expect(page.locator('#period-dates')).toContainText('16');
  await expect(page.locator('#period-dates')).toContainText('22');
  await page.locator('[data-period="weekend"]').click();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await expect(page.locator('.catalog-card')).toContainText('Encontro criativo');
  await expect(page.locator('#period-dates')).toContainText('21');
  await chooseCity(page, 'PE', 'Recife');
  await expect(page.locator('#no-events')).toBeVisible();
  await expect(page.locator('.active-place')).toHaveText('Recife / PE');
  await expect(page.locator('[data-period="weekend"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-period="all"]').click();
  await page.locator('#category-choices').getByRole('button', { name: 'Música · fixture', exact: true }).click();
  await expect(page.locator('.active-place')).toHaveText('Recife / PE');
  await expect(page.locator('#category-choices button[aria-pressed="true"]')).toBeFocused();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await page.locator('#reset-filters').click();
  await loaded(page);
  expect(state.methods).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`sticky header, 150% text, keyboard menu and reduced motion at 320px / ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 650 });
    await page.addInitScript(value => localStorage.setItem('ct-home-theme', value), theme);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const state = await fixture(page);
    await loaded(page);
    await page.locator('#accessibility-toggle').click();
    for (let i = 0; i < 5; i++) await page.locator('#font-up').click();
    await expect(page.locator('#font-reset')).toHaveText('150%');
    await page.locator('#accessibility-toggle').click();
    await noOverflow(page);
    await page.locator('.menu-toggle').click();
    await page.locator('#mobile-menu a[href="#seguranca"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#seguranca')).toBeFocused();
    const geometry = await page.evaluate(() => ({ header: document.querySelector('.topbar').getBoundingClientRect().toJSON(), target: document.querySelector('#seguranca').getBoundingClientRect().toJSON(), position: getComputedStyle(document.querySelector('.topbar')).position }));
    expect(geometry.position).toBe('sticky');
    expect(geometry.header.top).toBe(0);
    expect(geometry.header.height).toBeLessThan(170);
    expect(geometry.target.top).toBeGreaterThanOrEqual(geometry.header.bottom);
    expect(geometry.target.top).toBeLessThanOrEqual(geometry.header.bottom + 40);
    await screenshot(page, `text-150-${theme}-320`);
    await page.locator('.menu-toggle').click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeVisible();
    expect(await menu.evaluate(el => el.clientHeight <= innerHeight - document.querySelector('.topbar').offsetHeight)).toBe(true);
    expect(await menu.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 29, 29)');
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-toggle')).toBeFocused();
    expect(state.errors).toEqual([]);
  });
}

test('advertising is labeled at bottom left and the approved WhatsApp is only an explicit link', async ({ page }) => {
  await page.addInitScript(() => {
    window.geolocationCalls = 0;
    navigator.geolocation.getCurrentPosition = () => { window.geolocationCalls++; };
    navigator.geolocation.watchPosition = () => { window.geolocationCalls++; };
  });
  const state = await fixture(page);
  await loaded(page);
  const ad = page.locator('#advertising-primary');
  await expect(ad.locator('.eyebrow')).toHaveText('Publicidade');
  await expect(ad.locator('.eyebrow')).toHaveCSS('position', 'absolute');
  const geometry = await ad.evaluate(el => { const a = el.getBoundingClientRect(), b = el.querySelector('.eyebrow').getBoundingClientRect(); return { left: b.left - a.left, bottom: a.bottom - b.bottom }; });
  expect(geometry.left).toBeLessThan(30);
  expect(geometry.bottom).toBeLessThan(25);
  await expect(page.locator('#advertising-contact')).toHaveAttribute('href', 'https://wa.me/5581999311509?text=Ol%C3%A1%21%20Quero%20anunciar%20na%20Carioca%20Ticket.');
  await expect(page.locator('#advertising-contact')).toHaveAttribute('rel', 'noopener noreferrer');
  expect(await page.evaluate(() => window.geolocationCalls)).toBe(0);
  expect(state.methods).toEqual(['ctEventosPublicosListarPROD']);
  expect(state.blocked).toEqual([]);
});

test('approved ad rotation keeps the label visible, pauses for keyboard and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await fixture(page);
  await loaded(page);
  await expect(page.locator('#advertising-secondary')).toBeVisible();
  const ad = page.locator('#advertising-primary');
  await ad.scrollIntoViewIfNeeded();
  await expect(ad.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await expect(ad.locator('.eyebrow')).toBeVisible();
  const before = await ad.boundingBox();
  await ad.getByRole('button', { name: 'Próxima publicidade' }).focus();
  await page.keyboard.press('Enter');
  await expect(ad.locator('.ad-campaign')).toBeHidden();
  await expect(ad.locator('.ad-house')).toBeVisible();
  await expect(ad.locator('.eyebrow')).toBeVisible();
  const after = await ad.boundingBox();
  expect(after.height).toBeCloseTo(before.height, 0);
  await expect(ad.getByRole('button', { name: 'Próxima publicidade' })).toBeFocused();
  await expect(ad.getByRole('button', { name: 'Reproduzir', exact: true })).toBeVisible();
  await ad.getByRole('button', { name: 'Publicidade anterior' }).click();
  await expect(ad.locator('.ad-campaign')).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('invalid language and municipality preferences cannot break catalog or fabricate a place', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ct-home-locale', '__proto__');
    localStorage.setItem('ct-home-location', JSON.stringify({ uf: 'PE', id: '0000000', name: 'Fabricated' }));
  });
  const state = await fixture(page);
  await loaded(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('.active-place')).toHaveText('Todos os lugares');
  expect(state.errors).toEqual([]);
});


test('an unavailable optional controls script does not block the catalog or keyword search', async ({ page }) => {
  const state = await fixture(page, { noControls: true });
  await loaded(page);
  await expect(page.locator('#event-location-input')).toBeDisabled();
  await expect(page.locator('#accessibility-toggle')).toBeHidden();
  await page.locator('#event-search-input').fill('MUSICA');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  expect(state.errors).toEqual([]);
});

test('home controls have unique IDs after composition', async ({ page }) => {
  await fixture(page);
  const duplicates = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicates).toEqual([]);
});

test('all dictionaries have complete keys and interpolation tokens; shared words are intentional', () => {
  const sameWords = {
    'en-US': ['menuLabel', 'pix', 'checkin', 'legal'],
    es: ['theme', 'mode', 'light', 'explore', 'login', 'language', 'larger', 'agenda', 'filters', 'thisWeek', 'pix', 'events', 'legal', 'foundOne', 'foundMany', 'viewEvent', 'adPause'],
    'zh-Hans': ['pix']
  };
  const base = dictionaries['pt-BR'];
  const tokens = value => (value.match(/\{\w+\}/g) || []).sort();
  for (const [locale, dictionary] of Object.entries(dictionaries)) {
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(base).sort());
    for (const [key, value] of Object.entries(dictionary)) {
      expect(typeof value, `${locale}.${key}`).toBe('string');
      expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      expect(value, `${locale}.${key}`).not.toContain('\uFFFD');
      expect(tokens(value), `${locale}.${key}`).toEqual(tokens(base[key]));
    }
    if (locale !== 'pt-BR') expect(Object.keys(dictionary).filter(key => dictionary[key] === base[key]).sort()).toEqual(sameWords[locale].sort());
  }
});

async function checkAnnotatedCopy(page, locale) {
  const mismatch = await page.locator('[data-i18n], [data-i18n-placeholder], [data-i18n-aria-label]').evaluateAll((nodes, dictionary) => nodes.flatMap(node => {
    return [['i18n', null], ['i18nPlaceholder', 'placeholder'], ['i18nAriaLabel', 'aria-label']].flatMap(([key, attr]) => {
      if (!node.dataset[key]) return [];
      const actual = attr ? node.getAttribute(attr) : node.textContent;
      return dictionary[node.dataset[key]] === actual ? [] : [{ key: node.dataset[key], actual, expected: dictionary[node.dataset[key]] }];
    });
  }), dictionaries[locale]);
  expect(mismatch).toEqual([]);
}

async function unlocalizedVisibleCopy(page) {
  return page.evaluate(() => {
      const allowedText = new Set(['Carioca', 'Ticket', 'CARIOCA TICKET', 'contato@cariocaticket.com.br', '@cariocaticketbr', 'Instagram', 'Facebook', 'cariocaticket.com.br', 'A−', 'A-', 'A+']);
      const dynamic = '#event-rail-position, #event-rail-announcement, #active-place, #event-count, #event-search-feedback, #catalog-status-message, #location-status, #period-dates, .catalog-image-fallback, .catalog-photo .sr-only, .catalog-actions .sr-only';
      const sourceOnly = '.language-choice span[translate="no"], .catalog-original[translate="no"], .ad-campaign-title[translate="no"], [data-share-event-title][translate="no"], .active-place[translate="no"], #active-filters > span[translate="no"], #category-choices button[translate="no"], #city-options button[translate="no"]';
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const result = [];
      while (walker.nextNode()) {
        const node = walker.currentNode, text = node.textContent.trim(), parent = node.parentElement;
        if (!/\p{L}/u.test(text) || !parent || parent.closest('script,style,noscript,[aria-hidden="true"],[data-i18n],#home-language option,#location-uf option') || parent.closest(sourceOnly) || parent.closest(dynamic) || allowedText.has(text)) continue;
        if (parent.getClientRects().length && getComputedStyle(parent).visibility !== 'hidden') result.push({ text, tag: parent.tagName, id: parent.id });
      }
      return result;
  });
}

for (const locale of Object.keys(dictionaries)) {
  test(`complete visible and accessible interface, source language and dynamic states / ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 915 });
    const state = await fixture(page);
    await loaded(page);
    const dictionary = dictionaries[locale];
    await page.locator('#accessibility-toggle').click();
    await page.locator('#home-language').selectOption(locale);
    await checkAnnotatedCopy(page, locale);
    await expect(page).toHaveTitle(dictionary.pageTitle);
    await expect(page.locator('#mobile-menu')).toHaveAttribute('aria-label', dictionary.mobileNavigation);
    await expect(page.locator('footer [data-i18n="myAccount"]')).toHaveText(dictionary.myAccount);
    await expect(page.locator('#event-search-input')).toHaveAttribute('placeholder', dictionary.searchPlaceholder);
    await expect(page.locator('#event-count')).toHaveText(dictionary.availableMany.replace('{n}', '2'));
    const uncovered = await unlocalizedVisibleCopy(page);
    expect(uncovered).toEqual([]);
    const unlabeledAttributes = await page.locator('[aria-label], [placeholder]').evaluateAll(nodes => nodes.filter(node => {
      if (node.id === 'events-grid' || node.classList.contains('catalog-card')) return false; // Dynamic interpolated labels are asserted below.
      // Event-share fallback labels are translated by their isolated component.
      if (node.matches('[data-public-share="event"] input')) return false;
      const aria = node.getAttribute('aria-label'), placeholder = node.getAttribute('placeholder');
      return (aria && !node.dataset.i18nAriaLabel && aria !== 'Carioca Ticket') || (placeholder && !node.dataset.i18nPlaceholder);
    }).map(node => ({ id: node.id, aria: node.getAttribute('aria-label'), placeholder: node.getAttribute('placeholder') })));
    expect(unlabeledAttributes).toEqual([]);
    const shareMessageLabels = { 'pt-BR':'Mensagem do evento para compartilhar', 'en-US':'Event message to share', 'es':'Mensaje del evento para compartir', 'zh-Hans':'用于分享的活动消息' };
    for (const input of await page.locator('[data-public-share="event"] input').all()) await expect(input).toHaveAttribute('aria-label', shareMessageLabels[locale]);
    await expect(page.locator('#events-grid')).toHaveAttribute('aria-label', dictionary.eventFeature);
    for (let i = 0; i < events.length; i++) await expect(page.locator('.catalog-card').nth(i)).toHaveAttribute('aria-label', dictionary.railPosition.replace('{n}', String(i + 1)).replace('{total}', String(events.length)));

    await expect(page.locator('.brand-location .location-trigger')).toHaveAccessibleName(dictionary.choosePlace + ' ' + dictionary.allPlaces);
    await page.locator('#events-grid').focus();
    await page.keyboard.press('Home');
    for (const event of events) {
      if (event !== events[0]) await page.keyboard.press('ArrowRight');
      const card = page.locator(`[data-event-id="${event.id}"]`);
      const title = card.locator('.catalog-title a');
      await expect(title).toHaveText(event.nome);
      const original = await card.locator('.catalog-original').evaluateAll(nodes => nodes.map(node => ({ lang: node.lang, translate: node.getAttribute('translate') })));
      expect(original).toHaveLength(5);
      expect(original.every(item => item.lang === 'pt-BR' && item.translate === 'no')).toBe(true);
      await expect(card.locator('.catalog-description')).toHaveText(event.visual.descricaoCurta);
      await expect(card.locator('.btn-primary')).toHaveAccessibleName(dictionary.buy + ': ' + event.nome);
      await expect(card.locator('.catalog-photo')).toHaveAccessibleName(dictionary.viewEvent + ': ' + event.nome);
      const labelLanguages = await card.locator('.btn-primary').evaluate(node => node.getAttribute('aria-labelledby').split(' ').map(id => document.getElementById(id).closest('[lang]').lang));
      expect(labelLanguages).toEqual([locale, 'pt-BR']);
      await expect(card.locator('img')).toHaveAttribute('alt', '');
    }
    await page.locator('#accessibility-toggle').click();
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.menu-toggle')).toHaveAttribute('aria-label', dictionary.closeMenu);
    await checkAnnotatedCopy(page, locale);
    await screenshot(page, `language-${locale}-menu-320`);
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-toggle')).toHaveAttribute('aria-label', dictionary.openMenu);
    await page.locator('#event-location-input').click();
    await expect(page.locator('#location-status')).toHaveText(dictionary.chooseState);
    await page.locator('#location-uf').selectOption('PE');
    await page.locator('#city-search').fill('Caruaru');
    await page.locator('#city-options button').click();
    await page.locator('#location-apply').click();
    await expect(page.locator('.active-place')).toHaveText('Caruaru / PE');
    await expect(page.locator('.active-place')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('.brand-location .location-trigger')).toHaveAccessibleName(dictionary.choosePlace + ' Caruaru / PE');
    await expect(page.locator('#category-choices button').last()).toHaveText(events[1].visual.categoria);
    await expect(page.locator('#category-choices button').last()).toHaveAttribute('lang', 'pt-BR');
    await page.locator('#event-search-input').fill('sem-resultado-fixture');
    await page.locator('#event-search-form button').click();
    await expect(page.locator('#event-search-feedback')).toHaveText(dictionary.noMatch);
    await expect(page.locator('#no-events')).toBeVisible();
    await checkAnnotatedCopy(page, locale);
    await page.locator('#clear-event-search').click();
    await loaded(page);
    await page.locator('footer').scrollIntoViewIfNeeded();
    await screenshot(page, `language-${locale}-footer-320`);
    const ad = page.locator('#advertising-secondary');
    await expect(ad).toHaveAttribute('aria-label', dictionary.adLabel);
    await expect(ad.locator('[data-i18n="adCta"]')).toHaveText(dictionary.adCta);
    await ad.getByRole('button', { name: dictionary.adNext }).click();
    await expect(ad.locator('[role="status"]')).toHaveText(dictionary.adPosition.replace('{n}', '2').replace('{total}', '2'));
    await expect(ad.getByRole('button', { name: dictionary.adPlay, exact: true })).toBeVisible();
    await page.evaluate(() => CTHome.setLocale('pt-BR'));
    await expect(ad).toHaveAttribute('aria-label', dictionaries['pt-BR'].adLabel);
    await expect(ad.locator('[role="status"]')).toHaveText('Publicidade 2 de 2');
    expect(state.methods).toHaveLength(1);
    expect(state.errors).toEqual([]);
    expect(state.blocked).toEqual([]);
  });

  test(`translated catalog error, retry, empty and missing-data messages / ${locale}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('ct-home-locale', value), locale);
    const dictionary = dictionaries[locale];
    const state = await fixture(page, { result: attempt => attempt === 1 ? { sucesso: false } : attempt === 2 ? { sucesso: true, eventos: [] } : { sucesso: true, eventos: [{ id: 'INCOMPLETE', nome: 'Nome original — fixture' }] } });
    await expect(page.locator('#catalog-status-message')).toHaveText(dictionary.loadError);
    await expect(page.locator('#catalog-retry')).toHaveText(dictionary.retry);
    await page.locator('#catalog-retry').click();
    await expect(page.locator('#catalog-status-message')).toHaveText(dictionary.emptyCatalog);
    await page.reload();
    await expect(page.locator('.catalog-card')).toHaveCount(1);
    await expect(page.locator('.catalog-title a')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('.catalog-meta')).toHaveText(dictionary.dateMissing);
    await expect(page.locator('.catalog-meta')).not.toHaveClass(/catalog-original/);
    await expect(page.locator('.catalog-venue')).toHaveText(dictionary.venueMissing);
    await expect(page.locator('.catalog-image-fallback')).toHaveText(dictionary.coverMissing);
    expect(state.errors).toEqual([]);
  });
}

test('missing translation falls back to Portuguese with the correct language; invalid locale remains harmless', async ({ page }) => {
  const state = await fixture(page, { missingTranslation: true });
  await loaded(page);
  await page.locator('#accessibility-toggle').click();
  await page.locator('#home-language').selectOption('en-US');
  await expect(page.locator('#mobile-menu')).toHaveAttribute('aria-label', dictionaries['pt-BR'].mobileNavigation);
  await expect(page.locator('#mobile-menu')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('#mobile-menu [data-i18n="events"]')).toHaveText(dictionaries['en-US'].events);
  await expect(page.locator('#mobile-menu [data-i18n="events"]')).toHaveAttribute('lang', 'en-US');
  await page.evaluate(() => CTHome.setLocale('__proto__'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  expect(await page.evaluate(() => CTHome.t('unknown-key'))).toBe('unknown-key');
  expect(state.errors).toEqual([]);
});

test('approved local artwork bytes remain unchanged', () => {
  const { createHash } = require('node:crypto');
  for (const ad of approvedAds) {
    const bytes = fs.readFileSync(path.join(ROOT, `assets/home-ad-${ad.name}.png`));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ad.sha256);
  }
});

for (const theme of ['light', 'dark']) {
  for (const width of [320, 412, 768, 1440]) {
    test(`approved artwork, readable copy and destinations / ${theme} / ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1050 });
      await page.addInitScript(value => localStorage.setItem('ct-home-theme', value), theme);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const state = await fixture(page);
      await loaded(page);
      for (const ad of approvedAds) {
        const slot = page.locator(`#advertising-${ad.slot}`), link = slot.locator('.ad-campaign');
        await slot.scrollIntoViewIfNeeded();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', ad.href);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(link).not.toHaveAttribute('translate', 'no');
        await expect(link.locator('.ad-campaign-title')).toHaveAttribute('lang', 'pt-BR');
        await expect(link.locator('.ad-campaign-title')).toHaveAttribute('translate', 'no');
        await expect(link).toHaveAccessibleName(new RegExp(ad.title + '.*' + ad.cta));
        await expect(link.locator('.ad-campaign-cta')).toHaveText(ad.cta);
        await expect.poll(() => link.locator('img').evaluate(img => img.complete && img.naturalWidth)).toBe(ad.width);
        const geometry = await slot.evaluate(el => {
          const image = el.querySelector('.ad-campaign img'), caption = el.querySelector('.ad-caption'), label = el.querySelector('.eyebrow'), controls = el.querySelector('.ad-controls');
          const box = el.getBoundingClientRect(), pixels = image.getBoundingClientRect(), badge = label.getBoundingClientRect(), buttons = controls.getBoundingClientRect();
          return { ratio: pixels.width / pixels.height, naturalHeight: image.naturalHeight, fit: getComputedStyle(image).objectFit,
            filter: getComputedStyle(image).filter, font: parseFloat(getComputedStyle(caption).fontSize),
            labelLeft: badge.left - box.left, labelBottom: box.bottom - badge.bottom,
            labelClear: badge.right <= buttons.left || badge.top >= buttons.bottom,
            color: getComputedStyle(caption).color, ctaColor: getComputedStyle(el.querySelector('.ad-campaign-cta')).color, background: getComputedStyle(el).backgroundColor };
        });
        expect(geometry.ratio).toBeCloseTo(ad.width / ad.height, 2);
        expect(geometry.naturalHeight).toBe(ad.height);
        expect(geometry.fit).toBe('contain'); expect(geometry.filter).toBe('none');
        expect(geometry.font).toBeGreaterThanOrEqual(16);
        expect(geometry.labelLeft).toBeLessThan(30); expect(geometry.labelBottom).toBeLessThan(25); expect(geometry.labelClear).toBe(true);
        const luminance = color => {
          const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
          return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
        };
        for (const foreground of [geometry.color, geometry.ctaColor]) {
          const levels = [luminance(foreground), luminance(geometry.background)].sort((a, b) => b - a);
          expect((levels[0] + .05) / (levels[1] + .05)).toBeGreaterThanOrEqual(4.5);
        }
        await link.focus(); await expect(link).toBeFocused();
        expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
        await noOverflow(page);
        await slot.screenshot({ path: path.join(EVIDENCE, `advertising-${ad.name}-${theme}-${width}.png`), animations: 'disabled' });
      }
      expect(state.errors).toEqual([]); expect(state.blocked).toEqual([]);
    });
  }
}

test('missing approved artwork recovers to the actionable house advertisement', async ({ page }) => {
  const state = await fixture(page, { missingAds: true });
  await loaded(page);
  for (const ad of approvedAds) {
    const slot = page.locator(`#advertising-${ad.slot}`);
    await slot.scrollIntoViewIfNeeded();
    await expect(slot.locator('.ad-house')).toBeVisible();
    await expect(slot.locator('.ad-campaign')).toBeHidden();
    await expect(slot.locator('.ad-controls')).toBeHidden();
    await expect(slot.locator('.eyebrow')).toBeVisible();
    await expect(slot.locator('.ad-house a[href^="https://wa.me/"]')).toHaveAttribute('href', 'https://wa.me/5581999311509?text=Ol%C3%A1%21%20Quero%20anunciar%20na%20Carioca%20Ticket.');
  }
  expect(state.errors).toEqual([]);
});

test('translation audit cannot exempt untranslated campaign actions with translate=no', async ({ page }) => {
  const state = await fixture(page);
  await loaded(page);
  await expect(page.locator('#advertising-primary .ad-campaign')).toBeVisible();
  await page.evaluate(() => {
    const link = document.querySelector('#advertising-primary .ad-campaign');
    link.setAttribute('translate', 'no');
    const action = link.querySelector('.ad-campaign-cta');
    action.removeAttribute('data-i18n');
    action.textContent = 'AÇÃO SEM TRADUÇÃO';
  });
  expect(await unlocalizedVisibleCopy(page)).toContainEqual({ text: 'AÇÃO SEM TRADUÇÃO', tag: 'SPAN', id: '' });
  expect(state.errors).toEqual([]);
  expect(state.blocked).toEqual([]);
});

for (const width of [320, 1440]) for (const locale of Object.keys(dictionaries)) {
  test('campaign HTML language after render, enlargement and reload / ' + width + 'px / ' + locale, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await fixture(page), dictionary = dictionaries[locale];
    await loaded(page);
    await page.locator('#accessibility-toggle').click();
    await page.locator('#home-language').selectOption(locale);
    if (width === 320) for (let i = 0; i < 5; i++) await page.locator('#font-up').click();
    await page.locator('#accessibility-toggle').click();
    expect(await page.evaluate(() => localStorage.getItem('ct-home-locale'))).toBe(locale);
    for (const reloaded of [false, true]) {
      if (reloaded) { await page.reload(); await loaded(page); }
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('#home-language')).toHaveValue(locale);
      for (const ad of approvedAds) {
        const slot = page.locator('#advertising-' + ad.slot), link = slot.locator('.ad-campaign');
        const descriptionKey = ad.slot === 'primary' ? 'adTpssfDescription' : 'adPriscilaDescription';
        const ctaKey = ad.slot === 'primary' ? 'adTpssfCta' : 'adPriscilaCta';
        await slot.scrollIntoViewIfNeeded();
        // Translation/reflow is checked on a deliberately paused campaign.
        // Keep the independent autoplay tests responsible for timing behavior.
        await slot.locator('.ad-controls button').first().focus();
        if (!(await link.isVisible())) await slot.locator('.ad-controls button').last().click();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', ad.href);
        await expect(link).not.toHaveAttribute('translate', 'no');
        await expect(link.locator('.ad-campaign-title')).toHaveText(ad.title);
        await expect(link.locator('.ad-campaign-title')).toHaveAttribute('lang', 'pt-BR');
        await expect(link.locator('.ad-campaign-title')).toHaveAttribute('translate', 'no');
        await expect(link.locator('[data-i18n="' + descriptionKey + '"]')).toHaveText(dictionary[descriptionKey]);
        await expect(link.locator('[data-i18n="' + descriptionKey + '"]')).toHaveAttribute('lang', locale);
        await expect(link.locator('.ad-campaign-cta')).toHaveText(dictionary[ctaKey]);
        await expect(link.locator('.ad-campaign-cta')).toHaveAttribute('lang', locale);
        await expect(link).toHaveAccessibleName(new RegExp(ad.title + '.*' + dictionary[ctaKey]));
        await expect(link.locator('img')).toHaveAttribute('src', '/assets/home-ad-' + ad.name + '.png');
        const caption = await link.locator('.ad-caption').evaluate(node => ({
          width: node.clientWidth, scroll: node.scrollWidth, right: node.getBoundingClientRect().right, viewport: innerWidth
        }));
        expect(caption.scroll).toBeLessThanOrEqual(caption.width + 1);
        expect(caption.right).toBeLessThanOrEqual(caption.viewport);
        await noOverflow(page);
        if (!reloaded && locale === 'en-US') await screenshot(page, 'ad-caption-english-' + ad.slot + '-' + width);
      }
      expect(await unlocalizedVisibleCopy(page)).toEqual([]);
    }
    expect(state.methods).toEqual(['ctEventosPublicosListarPROD', 'ctEventosPublicosListarPROD']);
    expect(state.errors).toEqual([]);
    expect(state.blocked).toEqual([]);
  });
}

for (const width of [320, 375, 390]) for (const enlarged of [false, true]) {
  test('mobile contact email stays whole / ' + width + 'px / ' + (enlarged ? '150%' : '100%'), async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    await loaded(page);
    if (enlarged) {
      await page.locator('#accessibility-toggle').click();
      for (let i = 0; i < 5; i++) await page.locator('#font-up').click();
      await page.locator('#accessibility-toggle').click();
    }
    const contact = page.locator('.footer-contact'), email = contact.locator('a[href^="mailto:"]');
    await expect(email).toHaveAttribute('href', 'mailto:contato@cariocaticket.com.br');
    await expect(email).toHaveText('contato@cariocaticket.com.br');
    async function geometry() {
      return email.evaluate(node => {
        const text = node.firstChild, lines = new Map(), range = document.createRange();
        for (let i = 0; i < text.textContent.length; i++) {
          range.setStart(text, i); range.setEnd(text, i + 1);
          const rect = range.getBoundingClientRect(), y = Math.round(rect.top);
          lines.set(y, (lines.get(y) || '') + text.textContent[i]);
        }
        const box = node.getBoundingClientRect(), column = node.parentElement.getBoundingClientRect();
        return { lines: Array.from(lines.values()), fontSize: getComputedStyle(node).fontSize,
          left: box.left, right: box.right, columnLeft: column.left, columnRight: column.right,
          width: node.clientWidth, scrollWidth: node.scrollWidth, viewport: innerWidth };
      });
    }
    // Reproduce the previous two-column layout in this synthetic page only.
    const previous = await page.addStyleTag({ content: '.ct-home .footer-grid > .footer-contact { grid-column: auto !important; }' });
    await email.scrollIntoViewIfNeeded();
    const before = await geometry();
    await previous.evaluate(node => node.remove());
    await email.scrollIntoViewIfNeeded();
    const after = await geometry();
    console.log('FOOTER_CONTACT_REFLOW', JSON.stringify({ width, enlarged, before, after }));
    if (width === 320 && enlarged) expect(before.lines.length).toBeGreaterThan(1);
    expect(after.fontSize).toBe(before.fontSize);
    expect(after.lines).toEqual(['contato@cariocaticket.com.br']);
    expect(after.left).toBeGreaterThanOrEqual(after.columnLeft);
    expect(after.right).toBeLessThanOrEqual(after.columnRight + 1);
    expect(after.right).toBeLessThanOrEqual(after.viewport);
    expect(after.scrollWidth).toBeLessThanOrEqual(after.width + 1);
    await noOverflow(page);
    await screenshot(page, 'footer-contact-' + width + '-' + (enlarged ? 'text150' : 'text100'));
    expect(state.errors).toEqual([]);
    expect(state.blocked).toEqual([]);
  });
}





