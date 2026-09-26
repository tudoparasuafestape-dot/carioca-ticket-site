const { test, expect } = require('@playwright/test');

const EXPECTED_HOST = process.env.CT_EXPECTED_HOST || 'cariocaticket.com.br';

async function expectOfficial(page, path) {
  await expect.poll(() => {
    try { return new URL(page.url()).hostname; } catch (_) { return ''; }
  }, { timeout: 30000 }).toBe(EXPECTED_HOST);
  if (path) {
    await expect.poll(() => {
      try { return new URL(page.url()).pathname; } catch (_) { return ''; }
    }, { timeout: 30000 }).toBe(path);
  }
}

test.describe('Parceiro CT publicado', () => {
  test('programa publico consulta politica real sem criar cadastro', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message || String(error)));

    await page.goto('/parceiro/programa/?e2e=producao', { waitUntil: 'domcontentloaded' });
    await expectOfficial(page, '/parceiro/programa/');

    await expect(page.getByRole('heading', { name: /Indique produtores/i })).toBeVisible();
    await expect(page.locator('#heroCommission')).toHaveText('1', { timeout: 60000 });
    await expect(page.locator('#serviceFee')).toHaveText('10');
    await expect(page.locator('#anticipationMax')).toHaveText('80');
    await expect(page.locator('#anticipationFee')).toHaveText('3,5');
    await expect(page.locator('#materialsGrid')).toContainText('Tabela Comercial para Produtores');
    await expect(page.locator('#materialsGrid')).toContainText('Regulamento do Programa');

    const portal = page.getByRole('link', { name: /Já sou parceiro/i }).first();
    await expect(portal).toHaveAttribute('href', '/parceiro/');

    const terms = page.locator('a[href="/parceiro/regulamento/"]').first();
    await expect(terms).toBeVisible();

    expect(errors, 'Erros JavaScript no programa Parceiro CT publicado').toEqual([]);
  });

  test('Portal Parceiro existente continua disponível', async ({ page }) => {
    await page.goto('/parceiro/?e2e=producao', { waitUntil: 'domcontentloaded' });
    await expectOfficial(page, '/parceiro/');
    await expect(page.getByRole('heading', { name: /Seu resultado em um só lugar/i })).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();
    await expect(page.getByRole('link', { name: /Conheça o programa/i })).toHaveAttribute(
      'href',
      '/parceiro/programa/'
    );
  });

  test('Backoffice sem sessão permanece bloqueado', async ({ page }) => {
    await page.goto('/parceiro/admin/?e2e=producao', { waitUntil: 'domcontentloaded' });
    await expectOfficial(page, '/parceiro/admin/');
    await expect(page.locator('#gateDenied')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#app')).toBeHidden();
  });

  test('Ativação inválida não expõe formulário de criação de acesso', async ({ page }) => {
    await page.goto('/parceiro/ativar/?token=CT-E2E-TOKEN-DEFINITIVAMENTE-INVALIDO', {
      waitUntil: 'domcontentloaded'
    });
    await expectOfficial(page, '/parceiro/ativar/');
    await expect(page.locator('#invalid')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#activate')).toBeHidden();
    await expect(page.locator('#done')).toBeHidden();
  });
});
