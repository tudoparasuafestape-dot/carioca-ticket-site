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

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('/manifest.webmanifest');

    const pwa = await page.evaluate(async () => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const deadline = Date.now() + 90000;
      let status = 0;
      let manifest = null;

      while (Date.now() < deadline) {
        try {
          const response = await fetch('/manifest.webmanifest?e2e=' + Date.now(), {
            cache: 'no-store'
          });
          status = response.status;
          manifest = await response.json();

          const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
          const ready =
            icons.some(icon =>
              icon.src === '/assets/carioca-ticket-icon-192.png' &&
              icon.sizes === '192x192'
            ) &&
            icons.some(icon =>
              icon.src === '/assets/carioca-ticket-icon-512.png' &&
              icon.sizes === '512x512'
            ) &&
            icons.some(icon =>
              icon.src === '/assets/carioca-ticket-icon-maskable-512.png' &&
              icon.sizes === '512x512' &&
              String(icon.purpose || '').includes('maskable')
            );

          if (ready) break;
        } catch (_) {}

        await sleep(2000);
      }

      async function measure(src) {
        return await new Promise(resolve => {
          const img = new Image();
          img.onload = () => resolve({ ok: true, width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ ok: false, width: 0, height: 0 });
          img.src = src + '?e2e=' + Date.now();
        });
      }

      let swReady = false;
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SW_TIMEOUT')), 15000))
          ]);
          swReady = true;
        } catch (_) {}
      }

      return {
        status,
        manifest,
        icon192: await measure('/assets/carioca-ticket-icon-192.png'),
        icon512: await measure('/assets/carioca-ticket-icon-512.png'),
        mask512: await measure('/assets/carioca-ticket-icon-maskable-512.png'),
        swSupported: 'serviceWorker' in navigator,
        swReady
      };
    });

    expect(pwa.status).toBe(200);
    expect(pwa.manifest.name).toBe('Carioca Ticket');
    expect(pwa.manifest.display).toBe('standalone');
    expect(pwa.manifest.icons.some(icon =>
      icon.src === '/assets/carioca-ticket-icon-192.png' &&
      icon.sizes === '192x192'
    )).toBe(true);
    expect(pwa.manifest.icons.some(icon =>
      icon.src === '/assets/carioca-ticket-icon-512.png' &&
      icon.sizes === '512x512'
    )).toBe(true);
    expect(pwa.manifest.icons.some(icon =>
      icon.src === '/assets/carioca-ticket-icon-maskable-512.png' &&
      icon.sizes === '512x512' &&
      String(icon.purpose || '').includes('maskable')
    )).toBe(true);
    expect(pwa.icon192).toEqual({ ok: true, width: 192, height: 192 });
    expect(pwa.icon512).toEqual({ ok: true, width: 512, height: 512 });
    expect(pwa.mask512).toEqual({ ok: true, width: 512, height: 512 });
    expect(pwa.swSupported).toBe(true);
    expect(pwa.swReady).toBe(true);

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
