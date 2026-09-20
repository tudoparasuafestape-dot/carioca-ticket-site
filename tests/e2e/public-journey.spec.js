const { test, expect } = require('@playwright/test');

const OFFICIAL_HOST = 'cariocaticket.com.br';
const FORBIDDEN_HOSTS = ['script.google.com', 'googleusercontent.com', 'github.io'];

function installGuards(page) {
  const state = { serverErrors: [], pageErrors: [] };

  page.on('response', response => {
    if (response.status() >= 500) {
      state.serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  page.on('pageerror', error => {
    state.pageErrors.push(error.message || String(error));
  });

  return state;
}

async function expectOfficialTopUrl(page, routePattern) {
  await expect.poll(() => {
    try { return new URL(page.url()).hostname; } catch { return ''; }
  }, { timeout: 30000 }).toBe(OFFICIAL_HOST);

  if (routePattern) {
    await expect(page).toHaveURL(routePattern);
  }

  for (const host of FORBIDDEN_HOSTS) {
    expect(page.url(), `A barra do navegador nao pode expor ${host}`).not.toContain(host);
  }
}

async function expectNoForbiddenVisibleLinks(page) {
  const hrefs = await page.locator('a[href]').evaluateAll(els => els.map(el => el.href));
  const bad = hrefs.filter(href => FORBIDDEN_HOSTS.some(host => href.includes(host)));
  expect(bad, `Links visiveis apontando para hosts tecnicos: ${bad.join(', ')}`).toEqual([]);
}

function assertNoTechnicalFailures(state) {
  expect(state.serverErrors, `Respostas 5xx detectadas:\n${state.serverErrors.join('\n')}`).toEqual([]);
  expect(state.pageErrors, `Erros JavaScript detectados:\n${state.pageErrors.join('\n')}`).toEqual([]);
}

test.describe('Jornada publica protegida', () => {
  test('Home -> Evento -> Checkout -> Voltar ao evento', async ({ page }) => {
    const state = installGuards(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectOfficialTopUrl(page, /^https:\/\/cariocaticket\.com\.br\/?(?:[?#].*)?$/);
    await expect(page.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible();
    await expectNoForbiddenVisibleLinks(page);

    const verEvento = page.getByRole('link', { name: /ver evento/i }).first();
    await expect(verEvento).toBeVisible();
    await expect(verEvento).toHaveAttribute('href', /\/evento\//);
    await verEvento.click();

    await expectOfficialTopUrl(page, /cariocaticket\.com\.br\/evento\//);
    const eventFrame = page.frameLocator('#app');
    await expect(eventFrame.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible({ timeout: 60000 });
    await expect(eventFrame.locator('body')).not.toContainText('\\n');

    const comprar = eventFrame.getByRole('link', { name: /comprar ingresso|garantir meu ingresso|comprar agora/i }).first();
    await expect(comprar).toBeVisible();
    await comprar.click();

    await expectOfficialTopUrl(page, /cariocaticket\.com\.br\/checkout\//);
    const checkoutFrame = page.frameLocator('#app');
    await expect(checkoutFrame.getByText('Seus dados')).toBeVisible({ timeout: 60000 });
    await expect(checkoutFrame.getByLabel(/E-mail/i)).toBeVisible();
    await expect(checkoutFrame.locator('body')).not.toContainText('\\n');

    const voltar = checkoutFrame.getByRole('link', { name: /voltar ao evento/i }).first();
    await expect(voltar).toBeVisible();
    await voltar.click();

    await expectOfficialTopUrl(page, /cariocaticket\.com\.br\/evento\//);
    await expect(page.frameLocator('#app').getByText('Roda de Samba Estilo Carioca').first()).toBeVisible({ timeout: 60000 });

    assertNoTechnicalFailures(state);
  });

  test('Minha Carioca abre no dominio oficial e retorna aos eventos', async ({ page }) => {
    const state = installGuards(page);

    await page.goto('/minha-carioca/conta/?e2e=1', { waitUntil: 'domcontentloaded' });
    await expectOfficialTopUrl(page, /cariocaticket\.com\.br\/minha-carioca\/conta\//);
    await expect(page.getByRole('heading', { name: /Minha Carioca/i })).toBeVisible();
    await expect(page.getByLabel(/E-mail ou WhatsApp/i)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('\\n');
    await expectNoForbiddenVisibleLinks(page);

    const voltarEventos = page.getByRole('link', { name: /voltar aos eventos/i }).first();
    await expect(voltarEventos).toBeVisible();
    await voltarEventos.click();

    await expectOfficialTopUrl(page);
    await expect(page.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible({ timeout: 30000 });

    assertNoTechnicalFailures(state);
  });
});
