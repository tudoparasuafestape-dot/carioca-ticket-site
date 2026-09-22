const { test, expect } = require('@playwright/test');

const EVENT_ID = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';

async function expectFirstParty(page, pathname) {
  await expect.poll(() => {
    try { return new URL(page.url()).hostname; } catch (_) { return ''; }
  }, { timeout: 30000 }).toBe('cariocaticket.com.br');

  await expect.poll(() => {
    try { return new URL(page.url()).pathname; } catch (_) { return ''; }
  }, { timeout: 30000 }).toBe(pathname);
}

test.describe('Canario real first-party', () => {
  test('Portal v2 conversa com o backend real sem sair do dominio', async ({ page }) => {
    const iniciou = Date.now();
    await page.goto('/produtor-v2/', { waitUntil: 'domcontentloaded' });
    await expectFirstParty(page, '/produtor-v2/');

    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#senha')).toBeVisible();
    await expect(page.locator('#loginButton')).toBeEnabled({ timeout: 25000 });
    expect(Date.now() - iniciou).toBeLessThan(25000);
  });

  test('Portal oficial carrega a marca real do backend sem alerta visual', async ({ page }) => {
    const iniciou = Date.now();
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });
    await expectFirstParty(page, '/produtor/');

    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
    await expect(page.locator('#brandLogoDesktop')).toBeVisible();
    await expect(page.locator('#brandLogoError')).toBeHidden();

    await expect.poll(
      () => page.locator('#brandLogoDesktop').getAttribute('data-brand-source'),
      { timeout: 30000 }
    ).toBe('backend');

    const logo = await page.locator('#brandLogoDesktop').evaluate(img => ({
      src: img.getAttribute('src') || '',
      width: img.naturalWidth,
      height: img.naturalHeight
    }));

    expect(logo.src.startsWith('data:image/')).toBe(true);
    expect(logo.width).toBeGreaterThan(0);
    expect(logo.height).toBeGreaterThan(0);
    await expect(page.locator('#brandLogoError')).toBeHidden();
    expect(Date.now() - iniciou).toBeLessThan(30000);
  });


  test('Evento v2 carrega o evento real e aponta para Checkout v2', async ({ page }) => {
    const iniciou = Date.now();
    await page.goto('/evento-v2/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });
    await expectFirstParty(page, '/evento-v2/');

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 25000
    });
    expect(Date.now() - iniciou).toBeLessThan(25000);

    const comprar = page.getByRole('link', {
      name: /Comprar ingresso|Garantir meu ingresso|Comprar agora/i
    }).first();

    await expect(comprar).toBeVisible();
    await expect(comprar).toHaveAttribute('href', /\/checkout-v2\/\?evento=/);
  });

  test('Cupom canario consulta o motor real sem criar pedido ou cobranca', async ({ page }) => {
    await page.goto('/checkout-v2/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });
    await expectFirstParty(page, '/checkout-v2/');

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 25000
    });

    const typeSelect = page.locator('#typeSelect');
    const lotSelect = page.locator('#lotSelect');

    await expect.poll(
      () => typeSelect.locator('option').count(),
      { timeout: 30000 }
    ).toBeGreaterThan(1);

    await typeSelect.selectOption('TIPO-EBD1F87D');

    await expect.poll(
      () => lotSelect.locator('option').count(),
      { timeout: 15000 }
    ).toBeGreaterThan(1);

    await lotSelect.selectOption('LOTE-E2D1C48C');
    await page.locator('#couponToggle').click();
    await page.locator('#couponCode').fill('CTCANARIOINEXISTENTE');
    await page.locator('#couponApply').click();

    await expect(page.locator('#couponMessage')).toHaveText(
      'Cupom não encontrado.',
      { timeout: 30000 }
    );
    await expect(page.locator('#promoSummary')).toHaveClass(/hidden/);

    // Este canario para aqui: nao preenche comprador e nunca clica em pagar.
    await expect(page.locator('#payButton')).toBeVisible();
  });

  test('Checkout v2 carrega catalogo real sem criar cobranca', async ({ page }) => {
    const iniciou = Date.now();
    await page.goto('/checkout-v2/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });
    await expectFirstParty(page, '/checkout-v2/');

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 25000
    });
    await expect(page.getByText('Seus dados')).toBeVisible();
    expect(Date.now() - iniciou).toBeLessThan(25000);
    await expect(page.getByLabel(/E-mail/i)).toBeVisible();
    await expect(page.getByText('Cartão de crédito')).toBeVisible();
    await expect(page.getByText(/^PIX$/)).toBeVisible();

    const typeSelect = page.locator('#typeSelect');
    await expect.poll(
      () => typeSelect.locator('option').count(),
      { timeout: 30000 }
    ).toBeGreaterThan(1);

    // Nao clicamos em pagar. Este canario somente valida leitura/catalogo.
    await expect(page.locator('#payButton')).toBeVisible();
    await expect(page.locator('#eventBack')).toHaveAttribute('href', /\/evento-v2\/\?evento=/);
  });
});
