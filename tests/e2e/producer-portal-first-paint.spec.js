import { test, expect, mockRoute } from './helpers/branch-isolated.cjs';

// Only these actions/methods belong to this fixture; all other RPCs fall through to denial.
const MOCK_CONTRACT = {
  "rpc": {
    "portalRpc": [
      "ctCentralAcessoBootstrapPROD",
      "ctCentralAcessoObterCapacidadesPROD",
      "ctCentralAcessoObterFirebaseConfigPROD"
    ]
  }
};

const BRANCH_MODE = String(process.env.CT_BRANCH_MODE || '') === '1';

test.describe('Portal do Produtor — primeira pintura profissional', () => {
  test.skip(!BRANCH_MODE, 'Contrato visual roda contra a branch local.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.requestIdleCallback = function(){ return 1; };
      window.cancelIdleCallback = function(){};
    });

    // Simula Apps Script lento/indisponível. A interface básica não pode sumir.
    await mockRoute(page, MOCK_CONTRACT, route => route.abort());
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

  test('menu e visão geral — prévia sintética sem autenticação real', async ({ page }, testInfo) => {
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });
    // Visual fixture only. Do not claim this DOM setup tests server authorization.
    await page.evaluate(() => {
      document.getElementById('loginView').classList.add('hidden');
      document.getElementById('portalView').classList.remove('hidden');
      document.getElementById('helloName').textContent = 'Produtora de demonstração';
      document.getElementById('topUser').textContent = 'Conta de demonstração';
      document.getElementById('producerSelect').innerHTML = '<option>Produtora de demonstração</option>';
      document.getElementById('eventPickerTitle').textContent = 'Festival de demonstração';
      document.getElementById('eventPickerMeta').textContent = 'Dados sintéticos · rascunho';
    });
    await expect(page.locator('#workspaceMenuToggle')).toBeVisible();
    await expect(page.locator('#commercialPolicyLink')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('producer-overview-synthetic.png'), fullPage: true });
    await page.locator('#workspaceMenuToggle').click();
    await expect(page.locator('#eventsManagementLink')).toBeVisible();
    await expect(page.locator('#commercialPolicyLink')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('producer-menu-synthetic.png'), fullPage: true });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(page.locator('#workspaceMenu')).not.toHaveAttribute('open', '');
    await expect(page.locator('#workspaceMenuToggle')).toBeFocused();
    await page.locator('#workspaceMenuToggle').click();
    await page.locator('.top-title').click();
    await expect(page.locator('#workspaceMenu')).not.toHaveAttribute('open', '');
  });
});
