const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const CODE = 'CT-P0-ACOES-001';
const SIG = 'abcdefghijklmnopQRSTUVWX1234_-AB';
const EVENT = 'Roda de Samba Estilo Carioca';

const QR_DATA =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">' +
    '<rect width="220" height="220" fill="white"/>' +
    '<rect x="12" y="12" width="58" height="58" fill="black"/>' +
    '<rect x="150" y="12" width="58" height="58" fill="black"/>' +
    '<rect x="12" y="150" width="58" height="58" fill="black"/>' +
    '<rect x="90" y="90" width="18" height="18" fill="black"/>' +
    '<rect x="118" y="90" width="18" height="18" fill="black"/>' +
    '<rect x="90" y="118" width="18" height="18" fill="black"/>' +
    '<rect x="146" y="118" width="18" height="18" fill="black"/>' +
    '</svg>'
  );

function secureTicket() {
  return {
    sucesso: true,
    ingresso: {
      codigo: CODE,
      nome: 'Cliente Homologação',
      tipo: 'Individual',
      lote: 'Pré-venda',
      status: 'VÁLIDO',
      statusClasse: 'VALIDO',
      qrUrl: QR_DATA
    },
    evento: {
      nome: EVENT,
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE'
    },
    visual: { capaUrl: '' },
    seguranca: {
      autorizaEntrada: true,
      mensagem: 'Ingresso válido para uma entrada.'
    },
    links: {
      ingresso:
        '/ingresso/?codigo=' +
        encodeURIComponent(CODE) +
        '&sig=' +
        encodeURIComponent(SIG)
    }
  };
}

async function installBackend(page) {
  await page.route('https://script.google.com/**', async route => {
    const req = route.request();
    const params = new URLSearchParams(req.postData() || '');
    const id = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');

    expect(action).toBe('consultarIngressoSeguro');
    expect(String(params.get('codigo') || '')).toBe(CODE);
    expect(String(params.get('sig') || '')).toBe(SIG);
    expect(id).toMatch(/^ING-/);

    const payload = JSON.stringify({
      ctMinhaCariocaPost: true,
      id,
      ok: true,
      resultado: secureTicket(),
      erro: ''
    }).replace(/</g, '\\u003c');

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        '<!doctype html><html><body><script>' +
        'window.top.postMessage(' + payload + ', "*");' +
        '<\\/script></body></html>'
    });
  });
}

async function openTicket(page) {
  await page.goto(
    '/ingresso/?codigo=' +
      encodeURIComponent(CODE) +
      '&sig=' +
      encodeURIComponent(SIG),
    { waitUntil: 'domcontentloaded' }
  );

  await expect(page.locator('#ticket-view')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#ticket-view')).toContainText('Cliente Homologação');
  await expect(page.locator('#ticket-view')).toContainText('VÁLIDO');
  await expect(page.locator('#ticket-view')).toContainText(CODE);

  const qr = page.locator('img.qr');
  await expect(qr).toBeVisible();
  await expect.poll(async () => {
    return qr.evaluate(img => ({
      complete: img.complete,
      width: img.naturalWidth,
      height: img.naturalHeight
    }));
  }).toMatchObject({ complete: true, width: 220, height: 220 });
}

test.describe('P0 ações do ingresso digital', () => {
  test.skip(!BRANCH_MODE, 'Executa na branch com ingresso seguro simulado.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__ctPrinted = false;
      window.__ctShared = null;
      window.__ctCopied = null;

      window.print = () => {
        window.__ctPrinted = true;
      };

      try {
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: async data => {
            window.__ctShared = data;
          }
        });
      } catch (_) {}
    });

    await installBackend(page);
  });

  test('QR e os cinco controles ficam disponíveis no ingresso válido', async ({ page }) => {
    await openTicket(page);

    await expect(page.locator('#share-whatsapp')).toBeVisible();
    await expect(page.locator('#share-ticket')).toBeVisible();
    await expect(page.locator('#save-pdf')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voltar para Minha Carioca' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver eventos' })).toBeVisible();
  });

  test('WhatsApp monta link seguro e abre destino', async ({ page, context }) => {
    await context.route('https://wa.me/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body>WhatsApp OK</body></html>'
      });
    });

    await openTicket(page);

    const whatsapp = page.locator('#share-whatsapp');
    const href = String(await whatsapp.getAttribute('href') || '');

    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const wa = new URL(href);
    const text = decodeURIComponent(wa.searchParams.get('text') || '');
    expect(text).toContain('Meu ingresso Carioca Ticket');
    expect(text).toContain(EVENT);
    expect(text).toContain('codigo=' + CODE);
    expect(text).toContain('sig=');

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      whatsapp.click()
    ]);

    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toMatch(/^https:\/\/wa\.me\//);
    await expect(popup.getByText('WhatsApp OK')).toBeVisible();
    await popup.close();
  });

  test('Compartilhar ingresso usa compartilhamento nativo com URL segura', async ({ page }) => {
    await openTicket(page);

    await page.locator('#share-ticket').click();

    await expect.poll(() =>
      page.evaluate(() => window.__ctShared)
    ).not.toBeNull();

    const shared = await page.evaluate(() => window.__ctShared);
    expect(shared.title).toBe('Ingresso Carioca Ticket');
    expect(shared.text).toContain(EVENT);
    expect(shared.url).toContain('/ingresso/');
    expect(shared.url).toContain('codigo=' + CODE);
    expect(shared.url).toContain('sig=');
  });

  test('Compartilhar ingresso cai para copiar link quando share nativo não existe', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: undefined
        });
      } catch (_) {}
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async value => {
              window.__ctCopied = value;
            }
          }
        });
      } catch (_) {}
    });

    await openTicket(page);

    const share = page.locator('#share-ticket');
    await share.click();

    await expect(share).toHaveText('✓ Link copiado');

    const copied = String(await page.evaluate(() => window.__ctCopied || ''));
    expect(copied).toContain('/ingresso/');
    expect(copied).toContain('codigo=' + CODE);
    expect(copied).toContain('sig=');
  });

  test('Salvar em PDF chama impressão e layout impresso preserva ingresso e QR', async ({ page }) => {
    await openTicket(page);

    await page.locator('#save-pdf').click();
    expect(await page.evaluate(() => window.__ctPrinted)).toBe(true);

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#ticket-view')).toBeVisible();
    await expect(page.locator('img.qr')).toBeVisible();
    await expect(page.locator('.actions')).toBeHidden();
  });

  test('Voltar para Minha Carioca abre a área correta e preserva recuperação do aparelho', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'CT_MINHA_CARIOCA_COMPRAS_V1',
        JSON.stringify([{
          pedidoId: 'PED-P0-ACOES',
          token: 'TOKEN-P0-ACOES',
          eventoNome: 'Roda de Samba Estilo Carioca',
          atualizadoEm: new Date().toISOString()
        }])
      );
    });

    await openTicket(page);

    const back = page.getByRole('link', { name: 'Voltar para Minha Carioca' });
    await expect(back).toHaveAttribute('href', /\/minha-carioca\/conta\//);
    await back.click();

    await expect(page).toHaveURL(/\/minha-carioca\/conta\//);
    await expect(page.getByRole('heading', { name: 'Minha Carioca' })).toBeVisible();
    await expect(page.getByText('Compra segura encontrada neste aparelho')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir meus ingressos' })).toBeVisible();
  });

  test('Ver eventos volta para a home no bloco de eventos', async ({ page, context }) => {
    await context.route('https://cariocaticket.com.br/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html><body><section id="todos-eventos"><h1>Eventos</h1></section></body></html>'
        });
        return;
      }
      await route.continue();
    });

    await openTicket(page);

    const events = page.getByRole('link', { name: 'Ver eventos' });
    const href = String(await events.getAttribute('href') || '');
    expect(href).toContain('cariocaticket.com.br/');
    expect(href).toContain('#todos-eventos');

    await events.click();

    await expect(page).toHaveURL(/cariocaticket\.com\.br\/.*#todos-eventos$/);
    await expect(page.locator('#todos-eventos')).toBeVisible();
  });
});
