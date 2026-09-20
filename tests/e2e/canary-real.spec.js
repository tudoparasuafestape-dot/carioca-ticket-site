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
    await page.goto('/produtor-v2/', { waitUntil: 'domcontentloaded' });
    await expectFirstParty(page, '/produtor-v2/');

    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
    await expect(page.getByLabel(/^E-mail$/i)).toBeVisible();
    await expect(page.getByLabel(/^Senha$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Entrar$/i })).toBeEnabled({ timeout: 45000 });
  });

  test('Evento v2 carrega o evento real e aponta para Checkout v2', async ({ page }) => {
    await page.goto('/evento-v2/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });
    await expectFirstParty(page, '/evento-v2/');

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 60000
    });

    const comprar = page.getByRole('link', {
      name: /Comprar ingresso|Garantir meu ingresso|Comprar agora/i
    }).first();

    await expect(comprar).toBeVisible();
    await expect(comprar).toHaveAttribute('href', /\/checkout-v2\/\?evento=/);
  });

  test('Checkout v2 carrega catalogo real sem criar cobranca', async ({ page }) => {
    await page.goto('/checkout-v2/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });
    await expectFirstParty(page, '/checkout-v2/');

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 60000
    });
    await expect(page.getByText('Seus dados')).toBeVisible();
    await expect(page.getByLabel(/E-mail/i)).toBeVisible();
    await expect(page.getByText('Cartão de crédito')).toBeVisible();
    await expect(page.getByText(/^PIX$/)).toBeVisible();

    const typeSelect = page.locator('#typeSelect');
    await expect(typeSelect.locator('option')).toHaveCount(3, { timeout: 30000 }).catch(async () => {
      await expect(typeSelect.locator('option')).not.toHaveCount(1);
    });

    // Nao clicamos em pagar. Este canario somente valida leitura/catalogo.
    await expect(page.locator('#payButton')).toBeVisible();
    await expect(page.locator('#eventBack')).toHaveAttribute('href', /\/evento-v2\/\?evento=/);
  });
});
