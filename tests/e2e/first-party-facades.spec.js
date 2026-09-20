const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';

test.describe('Facadas first-party em homologacao', () => {
  test.skip(!BRANCH_MODE, 'Teste destinado ao codigo da branch antes da publicacao.');

  test('Portal do Produtor v2 renderiza no dominio first-party', async ({ page }) => {
    await page.goto('/produtor-v2/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Portal do Produtor').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
    await expect(page.getByLabel(/^E-mail$/i)).toBeVisible();
    await expect(page.getByLabel(/^Senha$/i)).toBeVisible();

    const hrefs = await page.locator('a[href]').evaluateAll(els => els.map(el => el.getAttribute('href') || ''));
    expect(hrefs.filter(href => /script\.google\.com|googleusercontent\.com|github\.io/i.test(href))).toEqual([]);
  });

  test('Usuarios e Permissoes v2 renderiza sem expor host tecnico', async ({ page }) => {
    await page.goto('/acessos-v2/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Carioca Ticket/i);
    await expect(page.locator('body')).toContainText(/Usuários|Permissões|Acessos/i);

    const hrefs = await page.locator('a[href]').evaluateAll(els => els.map(el => el.getAttribute('href') || ''));
    expect(hrefs.filter(href => /script\.google\.com|googleusercontent\.com|github\.io/i.test(href))).toEqual([]);
  });
});
