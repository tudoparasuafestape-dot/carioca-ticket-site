// Local-only: all pages, assets and RPC responses are intercepted. No production writes.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://ct-catalog.test';
const ERA = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
const RODA = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const rows = [
  { id: RODA, nome: 'Roda de Samba Estilo Carioca', data: '11/10/2026', horario: '15h às 22h',
    local: 'Vevets Recepções', cidade: 'Jaboatão dos Guararapes', uf: 'PE',
    visual: { capaUrl: '/assets/roda-samba-30-anos.webp', categoria: 'Samba & pagode' } },
  // The real ERA artwork is intentionally absent until Library materialization succeeds.
  { id: ERA, nome: 'ERA BEAUTY', visual: { categoria: 'Beleza',
    descricaoCurta: 'Encontro de mulheres empreendedoras da área da beleza.' } }
];

async function fixture(page, options = {}) {
  const state = { calls: [], errors: [], attempts: 0, release: null };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.context().route('**/*', async route => {
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
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.webp') ? 'image/webp' : 'image/png';
      return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    }
    if (url.origin !== 'https://script.google.com') return route.abort();
    const params = new URLSearchParams(request.postData() || '');
    state.calls.push({ method: params.get('metodo'), args: params.get('argsJson'), action: params.get('ctMinhaCariocaAction') });
    expect(request.method()).toBe('POST');
    expect(state.calls.at(-1)).toEqual({ method: 'ctEventosPublicosListarPROD', args: '[]', action: 'publicRpc' });
    state.attempts++;
    if (options.delay && state.attempts === 1) await new Promise(resolve => { state.release = resolve; });
    const result = typeof options.result === 'function' ? options.result(state.attempts) : options.result;
    const payload = { ctMinhaCariocaPost: true, id: params.get('ctMinhaCariocaRequestId'), ok: true,
      resultado: result === undefined ? { sucesso: true, eventos: rows } : result };
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
  await expect(page.locator('#event-count')).toHaveText('2 eventos disponíveis para compra.');
  await expect(page.locator('#events-grid')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#catalog-status')).toBeHidden();
  for (const event of rows) {
    const card = page.locator(`[data-event-id="${event.id}"]`);
    await expect(card.getByRole('heading')).toHaveText(event.nome);
    await expect(card.getByRole('link', { name: 'Comprar ingresso: ' + event.nome })).toHaveAttribute('href', '/checkout/?evento=' + event.id);
    await expect(card.getByRole('link', { name: 'Ver evento', exact: true })).toHaveAttribute('href', '/evento/?evento=' + event.id);
  }
  await expect(page.locator('.catalog-card').first().locator('img')).toBeVisible();
  expect(await page.locator('.catalog-card').first().locator('img').evaluate(img => getComputedStyle(img).objectFit)).toBe('contain');
  const cover = await page.locator('.catalog-photo').first().boundingBox();
  expect(cover.y).toBeLessThan(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.catalog-card')).not.toContainText(['R$']);
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

const threeEvents = [...rows, { id: 'EVT-LOCAL-THIRD', nome: 'Evento fictício — teste local 3',
  visual: { capaUrl: '/test-wide-cover.svg', categoria: 'Somente teste', descricaoCurta: 'Fixture local para conferir carregamento e bordas da capa.' } }];

test('third event lazy cover loads after scrolling without hiding the image from layout', async ({ page }, testInfo) => {
  await fixture(page, { result: { sucesso: true, eventos: threeEvents } });
  await expect(page.locator('.catalog-card')).toHaveCount(3);
  const card = page.locator('[data-event-id="EVT-LOCAL-THIRD"]');
  const image = card.locator('img');
  await expect(image).toHaveAttribute('loading', 'lazy');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 1882), { timeout: 4000 }).toBe(true);
  await expect(image).toBeVisible();
  await expect(card.locator('.catalog-image-fallback')).toBeHidden();
  await expect(card.getByRole('link', { name: 'Comprar ingresso: ' + threeEvents[2].nome })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('catalog-three-events.png') });
});

test('hover preserves complete covers with at least three events', async ({ page }) => {
  await fixture(page, { result: { sucesso: true, eventos: threeEvents } });
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

test('missing and broken images preserve titles and purchase links', async ({ page }) => {
  await fixture(page, { result: { sucesso: true, eventos: [rows[1], { ...rows[0], visual: { capaUrl: '/missing-cover.jpg' } }] } });
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  await expect(page.locator('.catalog-image-fallback')).toHaveText(['Capa indisponível', 'Capa indisponível']);
  await expect(page.getByRole('link', { name: /^Comprar ingresso:/ })).toHaveCount(2);
  await expect(page.locator('#catalog-retry')).toBeHidden();
});

test('empty catalog is different from a search with no matches', async ({ page }) => {
  await fixture(page, { result: { sucesso: true, eventos: [] } });
  await expect(page.locator('#catalog-status')).toContainText('Nenhum evento disponível no momento');
  await expect(page.locator('#no-events')).toBeHidden();
  await expect(page.locator('#catalog-retry')).toBeHidden();
  await expect(page.locator('.catalog-card')).toHaveCount(0);
});

test('API error shows a retry and no stale hard-coded events', async ({ page }) => {
  const state = await fixture(page, { result: attempt => attempt === 1 ? { sucesso: false } : { sucesso: true, eventos: [rows[1]] } });
  await expect(page.locator('#catalog-status')).toContainText('Não foi possível carregar os eventos');
  await expect(page.locator('.catalog-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await expect(page.locator('.catalog-card')).toContainText('ERA BEAUTY');
  expect(state.calls).toHaveLength(2);
  expect(state.errors).toEqual([]);
});

test('malformed response is an error, not an empty catalog', async ({ page }) => {
  await fixture(page, { result: { sucesso: true, eventos: [{ nome: 'Missing identifier' }] } });
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
  const event = { id: 'EVT-FUTURE-&"<>', nome: '<img src=x onerror=alert(1)>', visual: { capaUrl: 'javascript:alert(1)', descricaoCurta: 'Informação válida • Negócios' } };
  await fixture(page, { result: { sucesso: true, eventos: [event, event] } });
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await expect(page.locator('.catalog-title')).toHaveText(event.nome);
  await expect(page.locator('.catalog-description')).toHaveText('Informação válida • Negócios');
  await expect(page.locator('.catalog-card img')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Comprar ingresso: ' + event.nome })).toHaveAttribute('href', '/checkout/?evento=' + encodeURIComponent(event.id));
});
