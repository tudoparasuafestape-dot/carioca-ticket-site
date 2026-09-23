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

  test('Portal oficial carrega a marca estatica sem RPC de branding', async ({ page }) => {
    const iniciou = Date.now();
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });
    await expectFirstParty(page, '/produtor/');

    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
    await expect(page.locator('#brandLogoDesktop')).toBeVisible();
    await expect(page.locator('#brandLogoError')).toBeHidden();

    await expect.poll(
      () => page.locator('#brandLogoDesktop').getAttribute('data-brand-source'),
      { timeout: 30000 }
    ).toBe('static');

    const logo = await page.locator('#brandLogoDesktop').evaluate(img => ({
      src: img.getAttribute('src') || '',
      width: img.naturalWidth,
      height: img.naturalHeight
    }));

    expect(logo.src).toBe('/assets/carioca-ticket-logo.png');
    expect(logo.width).toBeGreaterThan(0);
    expect(logo.height).toBeGreaterThan(0);
    await expect(page.locator('#brandLogoError')).toBeHidden();
    expect(Date.now() - iniciou).toBeLessThan(30000);
  });


  test('Backoffice Master real existe e nega sessao invalida sem expor dados', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const value = JSON.stringify({
        token: 'CT-CANARIO-TOKEN-INVALIDO',
        expiraEm: '2099-01-01T00:00:00.000Z'
      });
      sessionStorage.setItem('CT_PORTAL_PRODUTOR_PROD_SESSION_V1', value);
      localStorage.setItem('CT_PORTAL_PRODUTOR_PROD_SESSION_V1', value);
    });

    await page.goto('/backoffice/', { waitUntil: 'domcontentloaded' });
    await expectFirstParty(page, '/backoffice/');

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible({
      timeout: 30000
    });

    const mensagem = await page.locator('#gateMessage').textContent();
    expect(String(mensagem || '')).not.toContain('CT_PORTAL_RPC_METODO_NAO_AUTORIZADO');
    expect(String(mensagem || '')).not.toContain('ctBackofficeMasterCarregarPROD');
    await expect(page.locator('#app')).toHaveClass(/hidden/);
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

  test('Link real da campanha chega ao checkout e tenta aplicar o cupom sem cobranca', async ({ page }) => {
    await page.goto('/evento-v2/?evento=' + encodeURIComponent(EVENT_ID) + '&cupom=30ANOSSEMRAZAO&src=canario', {
      waitUntil: 'domcontentloaded'
    });
    await expectFirstParty(page, '/evento-v2/');

    await expect(page.locator('#campaignNotice')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('#campaignNotice')).toContainText('30ANOSSEMRAZAO');

    const comprar = page.locator('#buyHero');
    const href = await comprar.getAttribute('href');
    expect(href || '').toContain('cupom=30ANOSSEMRAZAO');
    expect(href || '').toContain('src=CANARIO');
    expect(href || '').toContain('csid=');

    await comprar.click();
    await expectFirstParty(page, '/checkout-v2/');
    await expect(page.locator('#couponCode')).toHaveValue('30ANOSSEMRAZAO', { timeout: 25000 });

    await page.locator('#typeSelect').selectOption('TIPO-EBD1F87D');
    await expect.poll(
      () => page.locator('#lotSelect option').count(),
      { timeout: 15000 }
    ).toBeGreaterThan(1);
    await page.locator('#lotSelect').selectOption('LOTE-E2D1C48C');

    await expect.poll(async () => {
      const msg = String(await page.locator('#couponMessage').textContent() || '');
      const promoVisible = await page.locator('#promoSummary').isVisible();
      return promoVisible || /pausada|expirou|limite disponível|Cupom aplicado/i.test(msg);
    }, { timeout: 30000 }).toBe(true);

    const msg = String(await page.locator('#couponMessage').textContent() || '');
    console.log('CT_CANARIO_CAMPANHA_RESULTADO=' + msg.replace(/\s+/g, ' ').trim());

    if (/Cupom aplicado/i.test(msg)) {
      await expect(page.locator('#promoTotal')).toHaveText(/15,00/);
      await expect(page.locator('#couponMessage')).toContainText('Não inclui o copo oficial');
    } else {
      expect(msg).toMatch(/pausada|expirou|limite disponível/i);
    }

    // Não informa comprador e nunca inicia pagamento.
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
