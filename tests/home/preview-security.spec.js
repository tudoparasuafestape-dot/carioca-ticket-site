const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const ORIGIN = 'http://127.0.0.1:4175';
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
  await expect(page.locator('aside')).toContainText('dados sintéticos');
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  await expect(page.locator('.catalog-card').first()).toContainText('Encontro de música');
  expect(rpc).toEqual(['ctEventosPublicosListarPROD']);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: path.resolve(__dirname, '../../docs/reviews/home-stage1/screenshots/preview-local.png') });
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
