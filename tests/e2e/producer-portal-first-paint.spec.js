import { test, expect } from '@playwright/test';

const BRANCH_MODE = String(process.env.CT_BRANCH_MODE || '') === '1';

test.describe('Portal do Produtor — primeira pintura profissional', () => {
  test.skip(!BRANCH_MODE, 'Contrato visual roda contra a branch local.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.requestIdleCallback = function(){ return 1; };
      window.cancelIdleCallback = function(){};
    });

    // Simula Apps Script lento/indisponível. A interface básica não pode sumir.
    await page.route('https://script.google.com/**', route => route.abort());
  });

  test('exibe login e Criar conta sem esperar backend ou Firebase', async ({ page }) => {
    const firebaseRequests = [];
    page.on('request', request => {
      if (request.url().includes('gstatic.com/firebasejs/')) {
        firebaseRequests.push(request.url());
      }
    });

    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#loginView')).toBeVisible();
    await expect(page.locator('#loginButton')).toBeVisible();
    await expect(page.locator('#loginButton')).toBeEnabled();
    await expect(page.locator('#showRegisterButton')).toBeVisible();

    expect(firebaseRequests).toEqual([]);
  });

  test('abre o cadastro imediatamente na própria tela', async ({ page }) => {
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });

    await page.locator('#showRegisterButton').click();

    await expect(page.locator('#registerAuthView')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();
    await expect(page.locator('#registerName')).toBeVisible();
    await expect(page.locator('#registerEmail')).toBeVisible();
    await expect(page.locator('#registerPassword')).toBeVisible();
    await expect(page.locator('#registerButton')).toBeVisible();
  });
});
