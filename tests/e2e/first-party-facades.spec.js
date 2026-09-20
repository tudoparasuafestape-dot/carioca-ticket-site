const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const EVENT_ID = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=';

function eventoFixture() {
  return {
    sucesso: true,
    evento: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      endereco: 'Candeias',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE'
    },
    visual: {
      midiaTipo: 'IMAGEM',
      capaUrl: '',
      posterUrl: '',
      videoInternoDisponivel: false,
      videoEmbedUrl: '',
      videoUrl: '',
      descricaoCurta: '30 anos da Banda Sem Razão.',
      descricaoCompleta: 'Uma edição especial da Roda de Samba Estilo Carioca.',
      categoria: 'Samba & pagode',
      realizacao: 'Roda de Samba Estilo Carioca',
      destaque: '30 anos da Banda Sem Razão',
      observacoes: 'Apresente o QR Code na entrada.'
    },
    menorPreco: 'R$ 25,00',
    tipos: [
      {
        id: 'TIPO-IND',
        nome: 'Individual',
        descricao: 'Ingresso individual.',
        capacidadePorVenda: 1,
        lotes: [
          {
            id: 'LOTE-1',
            nome: 'Lote único',
            preco: 'R$ 25,00',
            precoNumero: 25,
            quantidadeLimitada: true,
            disponiveis: 100
          }
        ]
      }
    ],
    links: {}
  };
}

function checkoutFixture() {
  const base = eventoFixture();
  return {
    sucesso: true,
    evento: base.evento,
    visual: {
      descricaoCurta: base.visual.descricaoCurta,
      capaUrl: ''
    },
    tipos: base.tipos
  };
}

function rpcResult(method, args) {
  switch (method) {
    case 'ctCentralAcessoObterCapacidadesPROD':
      return {
        sucesso: true,
        loginEmailSenha: { habilitado: true },
        cadastro: { habilitado: true },
        recuperacaoSenha: { habilitado: true },
        google: { habilitado: false }
      };

    case 'ctMarcaOficialObterDataUriPROD':
      return ONE_PIXEL_PNG;

    case 'ctCentralAcessoObterFirebaseConfigPROD':
      return { sucesso: false };

    case 'ctEventoPublicoCarregarPROD':
      expect(String(args[0] || '')).toBe(EVENT_ID);
      return eventoFixture();

    case 'ctCheckoutPublicoCarregarEventoPROD':
      expect(String(args[0] || '')).toBe(EVENT_ID);
      return checkoutFixture();

    default:
      return {
        sucesso: false,
        mensagem: 'Método não necessário neste teste: ' + method
      };
  }
}

async function mockAppsScriptRpc(page) {
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const params = new URLSearchParams(request.postData() || '');
    const requestId = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    const method = String(params.get('metodo') || '');

    let args = [];
    try {
      args = JSON.parse(params.get('argsJson') || '[]');
      if (!Array.isArray(args)) args = [];
    } catch (_) {
      args = [];
    }

    if (!requestId || (action !== 'portalRpc' && action !== 'publicRpc')) {
      await route.fulfill({
        status: 400,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body>RPC inválido</body></html>'
      });
      return;
    }

    let resultado;
    let ok = true;
    let erro = '';

    try {
      resultado = rpcResult(method, args);
    } catch (e) {
      ok = false;
      erro = e && e.message ? e.message : String(e);
      resultado = null;
    }

    const payload = JSON.stringify({
      ctMinhaCariocaPost: true,
      id: requestId,
      ok,
      resultado,
      erro
    }).replace(/</g, '\\u003c');

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
        '<script>window.top.postMessage(' + payload + ', "*");</script>' +
        '</body></html>'
    });
  });
}

async function expectNoTechnicalVisibleLinks(page) {
  const hrefs = await page.locator('a[href]').evaluateAll(els =>
    els.map(el => el.getAttribute('href') || '')
  );
  expect(
    hrefs.filter(href => /script\.google\.com|googleusercontent\.com|github\.io/i.test(href))
  ).toEqual([]);
}

test.describe('Fachadas first-party em homologacao', () => {
  test.skip(!BRANCH_MODE, 'Teste destinado ao codigo da branch antes da publicacao.');

  test.beforeEach(async ({ page }) => {
    await mockAppsScriptRpc(page);
  });

  test('Portal do Produtor v2 renderiza o login first-party', async ({ page }) => {
    await page.goto('/produtor-v2/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#senha')).toBeVisible();
    await expect(page.locator('#loginButton')).toBeEnabled({ timeout: 15000 });

    expect(new URL(page.url()).pathname).toBe('/produtor-v2/');
    await expectNoTechnicalVisibleLinks(page);
  });

  test('Usuarios e Permissoes v2 renderiza sem expor host tecnico', async ({ page }) => {
    await page.goto('/acessos-v2/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('body')).toContainText(/Carioca Ticket/i);
    await expect(page.locator('body')).toContainText(/Usuários|Permissões|Acessos/i);

    expect(new URL(page.url()).pathname).toBe('/acessos-v2/');
    await expectNoTechnicalVisibleLinks(page);
  });

  test('Evento v2 carrega dados e CTA no dominio first-party', async ({ page }) => {
    await page.goto('/evento-v2/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByText('30 anos da Banda Sem Razão').first()).toBeVisible();

    const comprar = page.getByRole('link', {
      name: /Comprar ingresso|Garantir meu ingresso|Comprar agora/i
    }).first();

    await expect(comprar).toBeVisible();
    await expect(comprar).toHaveAttribute('href', /\/checkout-v2\/\?evento=/);

    expect(new URL(page.url()).pathname).toBe('/evento-v2/');
    await expectNoTechnicalVisibleLinks(page);
  });

  test('Checkout v2 carrega catalogo sem criar cobranca', async ({ page }) => {
    await page.goto('/checkout-v2/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByText('Seus dados')).toBeVisible();
    await expect(page.getByLabel(/E-mail/i)).toBeVisible();
    await expect(page.getByText('Cartão de crédito')).toBeVisible();
    await expect(page.getByText(/^PIX$/)).toBeVisible();

    await page.locator('#typeSelect').selectOption('TIPO-IND');
    await page.locator('#lotSelect').selectOption('LOTE-1');

    await expect(page.locator('#summaryPrice')).toHaveText(/R\$\s*25,00/);
    await expect(page.locator('#eventBack')).toHaveAttribute('href', /\/evento-v2\/\?evento=/);

    expect(new URL(page.url()).pathname).toBe('/checkout-v2/');
    await expectNoTechnicalVisibleLinks(page);

    // O teste termina antes do clique de pagamento: nenhuma cobranca e criada.
    await expect(page.locator('#payButton')).toBeVisible();
  });
});
