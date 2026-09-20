const { test, expect } = require('@playwright/test');

const EXPECTED_HOST = process.env.CT_EXPECTED_HOST || 'cariocaticket.com.br';
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
  }, { timeout: 30000 }).toBe(EXPECTED_HOST);

  if (routePattern) {
    await expect.poll(() => {
      try { return new URL(page.url()).pathname; } catch { return ''; }
    }, { timeout: 30000 }).toMatch(routePattern);
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
    await expectOfficialTopUrl(page, /^\/$/);
    await expect(page.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible();
    await expectNoForbiddenVisibleLinks(page);

    const verEvento = page.getByRole('link', { name: /^ver evento$/i }).first();
    await expect(verEvento).toBeVisible();
    await expect(verEvento).toHaveAttribute('href', /\/evento\//);
    await verEvento.click();

    await expectOfficialTopUrl(page, /^\/evento\/$/);
    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 60000
    });
    await expect(page.locator('body')).not.toContainText('\\n');
    await expectNoForbiddenVisibleLinks(page);

    const comprar = page.getByRole('link', {
      name: /comprar ingresso|garantir meu ingresso|comprar agora/i
    }).first();

    await expect(comprar).toBeVisible();
    await expect(comprar).toHaveAttribute('href', /\/checkout\/\?evento=/);
    await comprar.click();

    await expectOfficialTopUrl(page, /^\/checkout\/$/);
    await expect(page.getByText('Seus dados')).toBeVisible({ timeout: 60000 });
    await expect(page.getByLabel(/E-mail/i)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('\\n');
    await expectNoForbiddenVisibleLinks(page);

    const voltar = page.getByRole('link', { name: /voltar ao evento/i }).first();
    await expect(voltar).toBeVisible();
    await expect(voltar).toHaveAttribute('href', /\/evento\/\?evento=/);
    await voltar.click();

    await expectOfficialTopUrl(page, /^\/evento\/$/);
    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 60000
    });

    assertNoTechnicalFailures(state);
  });

  test('Minha Carioca abre no dominio oficial e retorna aos eventos', async ({ page }) => {
    const state = installGuards(page);

    await page.goto('/minha-carioca/conta/?e2e=1', { waitUntil: 'domcontentloaded' });
    await expectOfficialTopUrl(page, /^\/minha-carioca\/conta\/$/);
    await expect(page.getByRole('heading', { name: /Minha Carioca/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Seu e-mail ou WhatsApp cadastrado/i)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('\\n');
    await expectNoForbiddenVisibleLinks(page);

    const voltarEventos = page.getByRole('link', { name: /voltar aos eventos/i }).first();
    await expect(voltarEventos).toBeVisible();
    await voltarEventos.click();

    await expectOfficialTopUrl(page, /^\/$/);
    await expect(page.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible({ timeout: 30000 });

    assertNoTechnicalFailures(state);
  });
});
