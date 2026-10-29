// Local-only: all pages, assets and RPC responses are intercepted. No production writes.
const { test, expect, mockRoute } = require('./helpers/branch-isolated.cjs');
const { temporalEnvelope, legacyNoEndTemporal } = require('../fixtures/public-temporal-envelope.cjs');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://ct-catalog.test';
const ERA = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
const RODA = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const publicRows = [
  { temporal: legacyNoEndTemporal(), id: RODA, nome: 'Roda de Samba Estilo Carioca', data: '11/10/2026', horario: '15h às 22h',
    local: 'Vevets Recepções', cidade: 'Jaboatão dos Guararapes', uf: 'PE',
    visual: { capaUrl: '/assets/roda-samba-30-anos.webp', categoria: 'Samba & pagode' } },
  // The real ERA artwork is intentionally absent until Library materialization succeeds.
  { temporal: legacyNoEndTemporal(), id: ERA, nome: 'ERA BEAUTY', visual: { categoria: 'Beleza',
    descricaoCurta: 'Encontro de mulheres empreendedoras da área da beleza.' } }
];
// Keep cover/search/rail coverage using a separate fixture with the same date,
// name and category: only the two exact hidden IDs should disappear.
const endedSamba = publicRows[0];
const offsiteEra = publicRows[1];
const BEAUTY = 'SYNTHETIC-BEAUTY';
const rows = [{ ...endedSamba, id: 'SYNTHETIC-SAMBA' }, { ...offsiteEra, id: BEAUTY }];

function positiveCatalog(eventos, nowMs) { return { sucesso: true, ...temporalEnvelope('home', nowMs), eventos }; }

async function fixture(page, options = {}) {
  const state = { calls: [], errors: [], attempts: 0, release: null };
  page.on('pageerror', error => state.errors.push(error.message));
  await mockRoute(page.context(), { staticRoot: { root: ROOT, origin: ORIGIN }, resources: [ORIGIN + '/test-wide-cover.svg', ORIGIN + '/missing-cover.jpg'], rpc: { publicRpc: ['ctEventosPublicosListarPROD'] } }, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN) {
      if (url.pathname === '/test-wide-cover.svg') return route.fulfill({ contentType: 'image/svg+xml', body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="1882" height="836" viewBox="0 0 1882 836"><rect width="1882" height="836" fill="#163c4a"/><rect width="30" height="836" fill="#ffd66d"/><rect x="1852" width="30" height="836" fill="#ffd66d"/><g fill="white" font-family="Arial" text-anchor="middle"><text x="941" y="360" font-size="92">CAPA DE TESTE LOCAL</text><text x="941" y="490" font-size="54">1882 × 836 · bordas completas</text><text x="145" y="755" font-size="42">ESQUERDA</text><text x="1737" y="755" font-size="42">DIREITA</text></g></svg>' });
      if (url.pathname.includes('ct-analytics') || url.pathname === '/pwa-register.js')
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.resolve(ROOT, relative);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
        return route.fulfill({ status: 404, body: 'Local fixture: missing asset' });
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.webp') ? 'image/webp' : file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
      return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    }
    if (url.origin !== 'https://script.google.com') return route.abort();
    const params = new URLSearchParams(request.postData() || '');
    state.calls.push({ method: params.get('metodo'), args: params.get('argsJson'), action: params.get('ctMinhaCariocaAction') });
    expect(request.method()).toBe('POST');
    expect(state.calls.at(-1)).toEqual({ method: 'ctEventosPublicosListarPROD', args: '[]', action: 'publicRpc' });
    state.attempts++;
    if (options.delay && state.attempts === 1) await new Promise(resolve => { state.release = resolve; });
    const nowMs = await page.evaluate(() => Date.now());
    // Only the default positive fixture is constructed here. Custom results remain raw.
    const response = options.result === undefined ? positiveCatalog([endedSamba, offsiteEra, ...rows], nowMs)
      : typeof options.result === 'function' ? options.result(state.attempts, nowMs) : options.result;
    const payload = { ctMinhaCariocaPost: true, id: params.get('ctMinhaCariocaRequestId'), ok: true,
      resultado: response };
    // Apps Script can post from a nested sandbox, not only the form target window.
    const inner = '<script>window.top.postMessage(' + JSON.stringify(payload).replace(/</g, '\\u003c') + ', "*")</script>';
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<iframe srcdoc="' + inner.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>' });
  });
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
  return state;
}

test('a single public catalog appears early, with complete covers and validated routes', async ({ page }, testInfo) => {
  const state = await fixture(page);
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  await expect(page.locator('[data-event-id="' + RODA + '"]')).toHaveCount(0);
  await expect(page.locator('#event-count')).toHaveText('2 eventos disponíveis para compra.');
  await expect(page.locator('#events-grid')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#catalog-status')).toBeHidden();
  for (const event of rows) {
    const card = page.locator(`[data-event-id="${event.id}"]`);
    // Navigate the horizontal feature to inspect each original, accessible card.
    if (event !== rows[0]) await page.locator('#event-rail-next').click();
    await expect(card).not.toHaveAttribute('inert', '');
    await expect(card.getByRole('heading')).toHaveText(event.nome);
    await expect(card.getByRole('link', { name: 'Comprar ingresso: ' + event.nome })).toHaveAttribute('href', '/checkout/?evento=' + event.id);
    await expect(card.getByRole('link', { name: 'Ver evento', exact: true })).toHaveAttribute('href', '/evento/?evento=' + event.id);
  }
  await page.locator('#event-rail-previous').click();
  await expect(page.locator('#events-grid')).toHaveAttribute('data-active-index', '0');
  await expect(page.locator('.catalog-card').first().locator('.catalog-photo img')).toBeVisible();
  expect(await page.locator('.catalog-card').first().locator('.catalog-photo img').evaluate(img => getComputedStyle(img).objectFit)).toBe('contain');
  const cover = await page.locator('.catalog-photo').first().boundingBox();
  // Search, share and explicit rotation controls remain above a cover visible in the first viewport.
  expect(cover.y).toBeLessThan(page.viewportSize().height - 160);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('[data-event-id="'+BEAUTY+'"]')).not.toContainText('R$');
  await expect(page.locator('#producerPortalCta')).toHaveAttribute('href', '/produtor/');
  await expect(page.locator('#partnerProgramCta')).toHaveAttribute('href', '/parceiro/programa/');
  expect(state.calls).toHaveLength(1);
  expect(state.errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('catalog-home.png'), fullPage: true });
  await page.screenshot({ path: testInfo.outputPath('catalog-viewport.png') });
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
    await page.locator('#mobile-menu a[href="#todos-eventos"]').click();
    await expect(page.locator('#mobile-menu')).toBeHidden();
  }
});

const threeEvents = [...rows, { temporal: legacyNoEndTemporal(), id: 'EVT-LOCAL-THIRD', nome: 'Evento fictício — teste local 3',
  visual: { capaUrl: '/test-wide-cover.svg', categoria: 'Somente teste', descricaoCurta: 'Fixture local para conferir carregamento e bordas da capa.' } }];

test('third event lazy cover loads after horizontal navigation without hiding the image from layout', async ({ page }, testInfo) => {
  await fixture(page, { result: (attempt, nowMs) => positiveCatalog(threeEvents, nowMs) });
  await expect(page.locator('.catalog-card')).toHaveCount(3);
  const card = page.locator('[data-event-id="EVT-LOCAL-THIRD"]');
  const image = card.locator('.catalog-photo img');
  await expect(image).toHaveAttribute('loading', 'lazy');
  await page.locator('#events-grid').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#events-grid')).toHaveAttribute('data-active-index', '2');
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 1882), { timeout: 4000 }).toBe(true);
  await expect(image).toBeVisible();
  await expect(card.locator('.catalog-image-fallback')).toBeHidden();
  await expect(card.getByRole('link', { name: 'Comprar ingresso: ' + threeEvents[2].nome })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('catalog-three-events.png') });
});

test('hover preserves complete covers with at least three events', async ({ page }) => {
  await fixture(page, { result: (attempt, nowMs) => positiveCatalog(threeEvents, nowMs) });
  await expect(page.locator('.catalog-card')).toHaveCount(3);
  const cover = page.locator('.catalog-photo').first();
  const image = cover.locator('img');
  await expect(image).toBeVisible();
  await cover.hover();
  // Wait for the legacy 250ms transform transition before measuring the final box.
  await page.waitForTimeout(350);
  const geometry = await image.evaluate(img => {
    const bounds = img.getBoundingClientRect(), parent = img.parentElement.getBoundingClientRect();
    return { transform: getComputedStyle(img).transform, fit: getComputedStyle(img).objectFit, width: bounds.width, coverWidth: parent.width };
  });
  expect(geometry.transform).toBe('none');
  expect(geometry.fit).toBe('contain');
  expect(geometry.width).toBeLessThanOrEqual(geometry.coverWidth);
});

test('search submitted while loading applies to the eventual response and clears without reloading', async ({ page }) => {
  const state = await fixture(page, { delay: true });
  await expect(page.locator('#catalog-status')).toContainText('Carregando eventos');
  await page.getByRole('searchbox').fill('BELEZA');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect.poll(() => typeof state.release).toBe('function');
  state.release();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await expect(page.locator('.catalog-card')).toContainText('ERA BEAUTY');
  await page.getByRole('searchbox').fill('jaboatao');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.locator('.catalog-card')).toContainText('Roda de Samba');
  await page.getByRole('searchbox').fill('nenhum resultado');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.locator('#no-events')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  expect(state.calls).toHaveLength(1);
});

test('missing and broken images preserve other titles and sales links', async ({ page }) => {
  await fixture(page, { result: (attempt, nowMs) => positiveCatalog([endedSamba, offsiteEra, rows[1], { ...rows[0], visual: { capaUrl: '/missing-cover.jpg' } }], nowMs) });
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  await expect(page.locator('.catalog-image-fallback')).toHaveText(['Capa indisponível', 'Capa indisponível']);
  await expect(page.locator('.catalog-actions .btn-primary')).toHaveCount(2);
  const era = page.locator('[data-event-id="'+BEAUTY+'"]');
  await expect(era.getByRole('heading')).toHaveText(rows[1].nome);
  await expect(era.getByRole('link', { name: /^Comprar ingresso:/ })).toHaveAttribute('href', '/checkout/?evento=' + BEAUTY);
  await page.locator('#event-rail-next').click();
  const other = page.locator('[data-event-id="'+rows[0].id+'"]');
  await expect(other.getByRole('heading')).toHaveText(rows[0].nome);
  await expect(other.getByRole('link', { name: /^Comprar ingresso:/ })).toHaveAttribute('href', '/checkout/?evento=' + rows[0].id);
  await expect(other.getByRole('link', { name: 'Ver evento', exact: true })).toBeVisible();
  await expect(other.getByRole('link', { name: 'Ver evento', exact: true })).toHaveAttribute('href', '/evento/?evento=' + rows[0].id);
  await expect(page.locator('[data-event-id="'+RODA+'"]')).toHaveCount(0);
  await expect(page.locator('#catalog-retry')).toBeHidden();
});

test('empty catalog is different from a search with no matches', async ({ page }) => {
  await fixture(page, { result: (attempt, nowMs) => positiveCatalog([], nowMs) });
  await expect(page.locator('#catalog-status')).toContainText('Nenhum evento disponível no momento');
  await expect(page.locator('#no-events')).toBeHidden();
  await expect(page.locator('#catalog-retry')).toBeHidden();
  await expect(page.locator('.catalog-card')).toHaveCount(0);
});

test('API error shows a retry and no stale hard-coded events', async ({ page }) => {
  const state = await fixture(page, { result: (attempt, nowMs) => attempt === 1 ? { sucesso: false } : positiveCatalog([endedSamba, offsiteEra, rows[1]], nowMs) });
  await expect(page.locator('#catalog-status')).toContainText('Não foi possível carregar os eventos');
  await expect(page.locator('.catalog-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await expect(page.locator('.catalog-card')).toContainText('ERA BEAUTY');
  expect(state.calls).toHaveLength(2);
  expect(state.errors).toEqual([]);
});

test('malformed response is an error, not an empty catalog', async ({ page }) => {
  await fixture(page, { result: (attempt, nowMs) => positiveCatalog([{ nome: 'Missing identifier' }], nowMs) });
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.locator('#no-events')).toBeHidden();
});

test('timeout is recoverable and ignores late data from the removed iframe', async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page, { delay: true });
  await expect.poll(() => typeof state.release).toBe('function');
  await page.clock.fastForward(19000);
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  state.release();
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  expect(state.calls).toHaveLength(2);
});

test('new public IDs render without allowlists; unsafe content stays text and image schemes are rejected', async ({ page }) => {
  const event = { temporal: legacyNoEndTemporal(), id: 'EVT-FUTURE-&"<>', nome: '<img src=x onerror=alert(1)>', visual: { capaUrl: 'javascript:alert(1)', descricaoCurta: 'Informação válida • Negócios' } };
  await fixture(page, { result: (attempt, nowMs) => positiveCatalog([event, event], nowMs) });
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await expect(page.locator('.catalog-title')).toHaveText(event.nome);
  await expect(page.locator('.catalog-description')).toHaveText('Informação válida • Negócios');
  await expect(page.locator('.catalog-card img')).toHaveCount(1);
  await expect(page.locator('.catalog-card .ct-whatsapp-share img')).toHaveCount(1);
  await expect(page.locator('.catalog-card .ct-whatsapp-share img')).toHaveAttribute('src', '/assets/whatsapp-brand.svg');
  await expect(page.locator('.catalog-card .ct-whatsapp-share img')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('link', { name: 'Comprar ingresso: ' + event.nome })).toHaveAttribute('href', '/checkout/?evento=' + encodeURIComponent(event.id));
});

async function expectCatalogIds(page, ids) {
  await expect(page.locator('#events-grid')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => page.locator('.catalog-card').evaluateAll(cards => cards.map(card => card.dataset.eventId))).toEqual(ids);
  for (const id of [RODA, ERA]) {
    await expect(page.locator('#events-grid [data-event-id="' + id + '"], #events-grid a[href*="' + id + '"]')).toHaveCount(0);
  }
  const missing = await page.locator('#events-grid [aria-labelledby], #events-grid [aria-describedby]').evaluateAll(nodes =>
    nodes.flatMap(node => ['aria-labelledby', 'aria-describedby'].flatMap(attr =>
      (node.getAttribute(attr) || '').split(/\s+/).filter(id => id && !document.getElementById(id)))));
  expect(missing).toEqual([]);
}

test('hidden IDs never enter search, categories, carousel or translated cards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const ended = { ...endedSamba, nome: 'Evento encerrado exclusivo', visual: { categoria: 'Categoria encerrada exclusiva' } };
  const state = await fixture(page, { result: (attempt, nowMs) => positiveCatalog([ended, offsiteEra, ...rows, ended, offsiteEra, rows[1]], nowMs) });
  await expectCatalogIds(page, rows.map(event => event.id));
  await expect(page.locator('#category-choices')).not.toContainText('Categoria encerrada exclusiva');
  await page.locator('#event-rail-next').click();
  await expect(page.locator('.catalog-card:not([inert])')).toHaveAttribute('data-event-id', BEAUTY);
  await expect(page.locator('#event-rail-position')).toHaveText(await page.evaluate(() => CTHome.t('railPosition', { n: 2, total: 2 })));
  await page.getByRole('searchbox').fill(ended.nome);
  await page.locator('#event-search-form').dispatchEvent('submit');
  await expectCatalogIds(page, []);
  await expect(page.locator('#no-events')).toBeVisible();
  await expect(page.locator('#event-rail-controls')).toBeHidden();
  await page.locator('#clear-event-search').click();
  await page.locator('#category-choices button').filter({ hasText: 'Beleza' }).click();
  await expectCatalogIds(page, [BEAUTY]);
  await page.locator('#category-choices button[data-i18n="allCategories"]').click();
  for (const locale of ['en-US', 'es', 'zh-Hans', 'pt-BR']) {
    await page.locator('#home-language').selectOption(locale, { force: true });
    await expectCatalogIds(page, rows.map(event => event.id));
    await expect(page.locator('#category-choices')).not.toContainText('Categoria encerrada exclusiva');
  }
  expect(state.calls).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test('hidden-only response and retry remain empty with a separate demonstration entry', async ({ page }, testInfo) => {
  const state = await fixture(page, { result: (attempt, nowMs) => positiveCatalog(attempt === 1 ? [endedSamba, offsiteEra, ...rows] : [endedSamba, offsiteEra, endedSamba], nowMs) });
  await expectCatalogIds(page, rows.map(event => event.id));
  // Exercise the existing reload handler after success to invalidate cached nodes.
  await page.locator('#catalog-retry').evaluate(button => button.click());
  await expectCatalogIds(page, []);
  for (const locale of ['pt-BR', 'en-US', 'es', 'zh-Hans']) {
    await page.locator('#home-language').selectOption(locale, { force: true });
    await expect(page.locator('#catalog-status')).toBeVisible();
    await expect(page.locator('#catalog-status-message')).toHaveText(await page.evaluate(() => CTHome.t('emptyCatalog')));
    await expect(page.locator('#catalog-retry')).toBeHidden();
    await expect(page.locator('#no-events')).toBeHidden();
    await expect(page.locator('#collections')).toBeHidden();
    await expect(page.locator('#category-choices button:not([data-i18n="allCategories"])')).toHaveCount(0);
    await expect(page.locator('#event-rail-controls')).toBeHidden();
    await expect(page.locator('#event-rail-position')).toHaveText('');
    await expectCatalogIds(page, []);
    await expect(page.locator('#event-demonstration')).toBeVisible();
    await expect(page.locator('#event-demonstration a')).toHaveAttribute('href', '/demonstracao/roda-de-samba/');
    await expect(page.locator('#event-demonstration .demo-home-label')).toHaveText(await page.evaluate(() => CTHome.t('demoLabel')));
    await expect(page.locator('#events-grid #event-demonstration')).toHaveCount(0);
  }
  await page.reload();
  await expectCatalogIds(page, []);
  await expect(page.locator('#catalog-retry')).toBeHidden();
  await page.locator('#home-language').selectOption('pt-BR', { force: true });
  for (const theme of ['dark', 'light']) {
    await page.locator('#home-theme').selectOption(theme);
    const colors = await page.locator('#event-demonstration').evaluate(section => ({
      text: getComputedStyle(section.querySelector('.demo-home-label')).color,
      background: getComputedStyle(section).backgroundColor
    }));
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    const levels = [luminance(colors.text), luminance(colors.background)].sort((a, b) => a - b);
    expect((levels[1] + .05) / (levels[0] + .05)).toBeGreaterThanOrEqual(4.5);
    await page.locator('#event-demonstration').screenshot({ path: testInfo.outputPath('home-demo-' + theme + '.png') });
  }
  expect(state.calls).toHaveLength(3);
  expect(state.errors).toEqual([]);
});

for (const event of [endedSamba, offsiteEra]) test('single hidden ID produces a valid empty catalog: ' + event.id, async ({ page }) => {
  const state = await fixture(page, { result: (attempt, nowMs) => positiveCatalog([event], nowMs) });
  await expectCatalogIds(page, []);
  await expect(page.locator('#catalog-status-message')).toHaveText(await page.evaluate(() => CTHome.t('emptyCatalog')));
  await expect(page.locator('#catalog-retry')).toBeHidden();
  await expect(page.locator('#event-count')).toHaveText(await page.evaluate(() => CTHome.t('availableMany', { n: 0 })));
  await expect(page.locator('#event-demonstration')).toBeVisible();
  expect(state.errors).toEqual([]);
});

// Negative roots are deliberately not decorated by the positive fixture builder.
for (const kind of ['missing', 'inclusive-legacy']) test('rejects incompatible temporal root: ' + kind, async ({ page }) => {
  const raw = { sucesso: true, eventos: rows };
  if (kind === 'inclusive-legacy') Object.assign(raw, temporalEnvelope('home', Date.now()), { eligibilityContract: 'CT_PUBLIC_ELIGIBILITY_INCLUSIVE_V0' });
  await fixture(page, { result: raw });
  await expect(page.locator('.catalog-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.locator('#no-events')).toBeHidden();
});
