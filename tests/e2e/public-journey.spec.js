const { test, expect } = require('./helpers/public-isolated.cjs');

const EXPECTED_HOST = '127.0.0.1';
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

test.describe('Jornada publica com fixtures', () => {
  test('Home -> Evento -> Checkout -> Voltar ao evento', async ({ page }) => {
    const state = installGuards(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectOfficialTopUrl(page, /^\/$/);
    await expect(page.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible();

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('/manifest.webmanifest');

    // The original PWA assertions run separately in pwa-isolated.cjs, with a loopback-only server.

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

    const eventoIdAtual = new URL(page.url()).searchParams.get('evento');
    expect(eventoIdAtual).toBeTruthy();

    const compartilharEvento = page.locator('#shareHero');
    await expect(compartilharEvento).toBeVisible();
    await expect(compartilharEvento).toHaveAttribute(
      'data-share-url',
      'http://127.0.0.1:4173/evento/?evento=' + encodeURIComponent(eventoIdAtual)
    );

    await compartilharEvento.click();
    await expect(page.locator('#shareMenu')).toBeVisible();
    await expect(page.locator('#copyLinkAction')).toHaveAttribute(
      'data-share-url',
      'http://127.0.0.1:4173/evento/?evento=' + encodeURIComponent(eventoIdAtual)
    );

    await page.locator('#shareMenuClose').click();
    await expect(page.locator('#shareMenu')).toBeHidden();
    await expect(page.locator('#shareMenuBackdrop')).toBeHidden();

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

  test('Home torna acessos de produtor e parceiro encontráveis sem conhecer URLs', async ({ page }) => {
    const state = installGuards(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectOfficialTopUrl(page, /^\/$/);

    const produtor = page.locator('#producerPortalCta');
    const programa = page.locator('#partnerProgramCta');
    const parceiro = page.locator('#partnerPortalCta');

    await expect(produtor).toBeVisible();
    await expect(produtor).toHaveAttribute('href', '/produtor/');
    await expect(programa).toBeVisible();
    await expect(programa).toHaveAttribute('href', '/parceiro/programa/');
    await expect(parceiro).toBeVisible();
    await expect(parceiro).toHaveAttribute('href', '/parceiro/');

    await produtor.click();
    await expectOfficialTopUrl(page, /^\/produtor\/$/);
    await expect(page.locator('#loginView')).toBeVisible({ timeout:30000 });

    await page.goto('/', { waitUntil:'domcontentloaded' });
    await page.locator('#partnerProgramCta').click();
    await expectOfficialTopUrl(page, /^\/parceiro\/programa\/$/);
    await expect(page.getByRole('heading', { name:/Indique produtores/i })).toBeVisible({ timeout:30000 });

    await page.goto('/', { waitUntil:'domcontentloaded' });
    await page.locator('#partnerPortalCta').click();
    await expectOfficialTopUrl(page, /^\/parceiro\/$/);
    await expect(page.getByRole('heading', { name:/Seu resultado em um só lugar/i })).toBeVisible({ timeout:30000 });

    assertNoTechnicalFailures(state);
  });

  test('Minha Carioca abre no dominio local e retorna aos eventos', async ({ page }) => {
    const state = installGuards(page);

    await page.goto('/minha-carioca/conta/?e2e=1', { waitUntil: 'domcontentloaded' });
    await expectOfficialTopUrl(page, /^\/minha-carioca\/conta\/$/);
    await expect(page.getByRole('heading', { name: /Minha Carioca/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Seu e-mail cadastrado na compra/i)).toBeVisible();
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
