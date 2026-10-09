const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { capture, settlePaint } = require('./capture.cjs');
const ORIGIN = 'http://127.0.0.1:4175';
const EVIDENCE = path.resolve(__dirname, '../../docs/reviews/home-v1/screenshots');
let server;
test.beforeAll(async () => {
  server = spawn(process.execPath, [path.resolve(__dirname, '../home-preview-server.cjs')], { env: { ...process.env, CT_PREVIEW_PORT: '4175' }, windowsHide: true, stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview startup timeout')), 10000);
    server.once('error', reject);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
});
test.afterAll(() => { if (server) server.kill(); });

test('review server serves fixtures and rejects external destinations and all transactional methods', async ({ page, request }) => {
  const external = [], rpc = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('**/*', async route => {
    const req = route.request();
    if (new URL(req.url()).origin !== ORIGIN) { external.push(req.url()); return route.abort(); }
    if (req.method() === 'POST') rpc.push(new URLSearchParams(req.postData()).get('metodo'));
    return route.continue();
  });
  const response = await page.goto(ORIGIN);
  expect(response.headers()['content-security-policy']).toContain("form-action 'self'");
  await expect(page.locator('#preview-notice')).toContainText('dados sintéticos');
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  await expect(page.locator('.catalog-card').first()).toContainText('Encontro de música');
  expect(rpc).toEqual(['ctEventosPublicosListarPROD']);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  for (const name of ['tpssf', 'priscila']) {
    const artwork = await request.get(ORIGIN + `/assets/home-ad-${name}.png`);
    expect(artwork.status()).toBe(200);
    expect(artwork.headers()['content-type']).toBe('image/png');
  }
  for (const slot of ['primary', 'secondary']) {
    const link = page.locator(`#advertising-${slot} .ad-campaign`);
    await expect(link).toHaveAttribute('href', '/__blocked');
    await link.scrollIntoViewIfNeeded();
    const opened = page.context().waitForEvent('page');
    await link.click();
    const popup = await opened;
    await expect(popup.getByRole('heading')).toHaveText('Destino bloqueado no preview');
    await popup.close();
  }
  expect(external).toEqual([]);
  await capture(page, path.join(EVIDENCE, 'preview-local.png'));
  expect((await request.post(ORIGIN + '/__fixture/catalog', { form: { metodo: 'TRANSACTION_MUST_BE_BLOCKED', argsJson: '[]', ctMinhaCariocaAction: 'publicRpc' } })).status()).toBe(403);
  expect((await request.post(ORIGIN + '/checkout/')).status()).toBe(405);
  expect((await request.get(ORIGIN + '/produtor/')).status()).toBe(403);
  await page.getByRole('link', { name: /^Comprar ingresso:/ }).first().click();
  await expect(page.getByRole('heading')).toHaveText('Destino bloqueado no preview');
  for (const scenario of ['empty', 'error', 'missing']) {
    await page.goto(ORIGIN + '/?scenario=' + scenario);
    if (scenario === 'empty') await expect(page.locator('#catalog-status')).toContainText('Nenhum evento disponível');
    if (scenario === 'error') await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    if (scenario === 'missing') await expect(page.locator('.catalog-image-fallback')).toHaveText(['Capa indisponível', 'Capa indisponível']);
  }
});

// Inspect the browser's PNG bytes, not only DOM visibility. A blank decorative
// panel can pass visibility/contrast assertions while the capture is incomplete.
async function goldPixelCount(page, png, region) {
  return page.evaluate(async ({ encoded, region }) => {
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { x, y, width, height } = region || { x: 0, y: 0, width: image.width, height: image.height };
    const data = context.getImageData(Math.ceil(x), Math.ceil(y), Math.floor(width), Math.floor(height)).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r > 130 && r > g && g > b && r - b > 40) count++;
    }
    return count;
  }, { encoded: png.toString('base64'), region });
}

for (const theme of ['light', 'dark']) {
  test(`served preview paints producer text in ${theme} viewport and full-page PNGs`, async ({ page }) => {
    const external = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.context().route('**/*', route => {
      if (new URL(route.request().url()).origin !== ORIGIN) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(ORIGIN);
    await expect(page.locator('.catalog-card')).toHaveCount(2);
    await expect(page.locator('html')).toHaveAttribute('data-home-theme', theme);
    const note = page.locator('.producer-note');
    await expect(note).toContainText('DA IDEIA');
    await expect(note).toContainText('aplauso.');
    await expect(note).toContainText('CARIOCA TICKET');
    await note.scrollIntoViewIfNeeded();
    await settlePaint(page);
    await capture(page, path.join(EVIDENCE, `preview-${theme}-producer-viewport.png`));
    const detail = await note.screenshot({ path: path.join(EVIDENCE, `preview-${theme}-producer.png`), animations: 'disabled' });
    const detailGold = await goldPixelCount(page, detail);
    expect(detailGold).toBeGreaterThan(1000);
    const details = await note.evaluate(node => {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      return { text: node.textContent, color: style.color, background: style.backgroundColor,
        region: { x: box.x, y: box.y + scrollY, width: box.width, height: box.height },
        fonts: document.fonts.status };
    });
    const captures = [];
    for (let repeat = 1; repeat <= 2; repeat++) {
      const png = await capture(page, path.join(EVIDENCE, `preview-${theme}-full-${repeat}.png`), true);
      const goldPixels = await goldPixelCount(page, png, details.region);
      expect(goldPixels).toBeGreaterThan(1000);
      captures.push({ repeat, goldPixels, sha256: createHash('sha256').update(png).digest('hex') });
    }
    // Sticky native header controls can differ by a few antialiased pixels.
    // Compare the producer paint that this regression test protects.
    expect(captures[0].goldPixels).toBe(captures[1].goldPixels);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    fs.writeFileSync(path.join(EVIDENCE, `preview-${theme}-paint.json`), JSON.stringify({ theme, viewport: page.viewportSize(), ...details, detailGold, captures, externalRequests: external.length, pageErrors: errors }, null, 2) + '\n');
  });
}
