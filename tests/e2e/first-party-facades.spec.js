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
    tipos: base.tipos,
    identidadeCliente: {
      identificadorPrincipal: 'WHATSAPP',
      whatsappObrigatorio: true,
      emailObrigatorio: false
    }
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
      expect(['DESKTOP', 'MOBILE']).toContain(String(args[0] || ''));
      return ONE_PIXEL_PNG;

    case 'ctCentralAcessoObterFirebaseConfigPROD':
      return { sucesso: false };

    case 'ctEventoPublicoCarregarPROD':
      expect(String(args[0] || '')).toBe(EVENT_ID);
      return eventoFixture();

    case 'ctCheckoutPublicoCarregarEventoPROD':
      expect(String(args[0] || '')).toBe(EVENT_ID);
      return checkoutFixture();

    case 'ctSaudeVendasCarregarPROD':
      expect(String(args[1] || '')).toBe(EVENT_ID);
      return {
        sucesso: true,
        autenticado: true,
        autorizado: true,
        modulo: 'SAUDE_VENDAS',
        evento: eventoFixture().evento,
        nivel: 'VERDE',
        resumo: {
          pedidos: 4,
          concluidos: 4,
          aguardando: 0,
          criticos: 0,
          atencoes: 0,
          webhookFila: 0,
          webhookFalhas: 0
        },
        sistema: {
          processadorAgendado: true,
          webhook: { recebidos: 0, processados: 4, falhas: 0, atrasados: 0 },
          observabilidade24h: { abertos: 0, error: 0, critical: 0 },
          webhookAsaas: {
            consultaOk: true,
            configurado: true,
            ativos: 1,
            interrompidos: 0,
            total: 1,
            coberturaCompleta: true,
            eventosFaltantes: [],
            webhooks: [
              {
                host: 'webhook.cariocaticket.com.br',
                enabled: true,
                interrupted: false
              }
            ],
            somenteLeitura: true
          },
          recuperacaoAutomatica: true
        },
        ocorrencias: [],
        piiExposta: false,
        somenteLeitura: true,
        atualizadoEm: '21/09/2026 09:30:00'
      };

    case 'ctReembolsosCarregarPROD':
      expect(String(args[1] || '')).toBe(EVENT_ID);
      return {
        sucesso: true,
        autenticado: true,
        autorizado: true,
        evento: eventoFixture().evento,
        itens: [
          {
            pedidoId: 'PED-TESTE-1234567890',
            pedidoFinal: '1234567890',
            vendaId: 'VENDA-TESTE',
            compradorNome: 'Cliente Teste',
            tipoNome: 'Individual',
            formaPagamento: 'CREDIT_CARD',
            valorNumero: 25,
            valor: 'R$ 25,00',
            statusFinanceiro: 'CONFIRMADO',
            statusProvedor: 'CONFIRMED',
            statusPedido: 'CONCLUIDO',
            podeAnalisar: true,
            potencialmenteReembolsavel: true
          }
        ],
        somenteLeitura: true,
        parcialAutomatico: false
      };

    case 'ctReembolsosDiagnosticarPROD':
      expect(String(args[1] || '')).toBe(EVENT_ID);
      return {
        sucesso: true,
        autorizado: true,
        pedido: {
          pedidoId: 'PED-TESTE-1234567890',
          pedidoFinal: '1234567890',
          vendaId: 'VENDA-TESTE',
          compradorNome: 'Cliente Teste',
          tipoNome: 'Individual',
          status: 'CONCLUIDO'
        },
        pagamento: {
          formaPagamento: 'CREDIT_CARD',
          valorNumero: 25,
          valor: 'R$ 25,00',
          statusFinanceiro: 'CONFIRMADO',
          statusProvedorLocal: 'CONFIRMED',
          statusAsaas: 'CONFIRMED'
        },
        cancelamentoLocal: {
          prontoParaCancelar: true,
          cancelamentoConcluido: false,
          erros: []
        },
        podeReembolsar: true,
        bloqueios: [],
        somenteLeitura: true
      };

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


function minhaCariocaEnvelope(result) {
  return {
    ctMinhaCariocaPost: true,
    id: result.id,
    ok: result.ok,
    resultado: result.resultado || null,
    erro: result.erro || ''
  };
}

async function mockMinhaCariocaSession(page, sessionResult) {
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const params = new URLSearchParams(request.postData() || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    if (action !== 'consultarSessao' && action !== 'logout') {
      await route.fallback();
      return;
    }

    const requestId = String(params.get('ctMinhaCariocaRequestId') || '');
    const payload = minhaCariocaEnvelope({
      id: requestId,
      ok: true,
      resultado: action === 'logout' ? { sucesso: true } : sessionResult
    });

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        '<!doctype html><html><body><script>' +
        'window.top.postMessage(' + JSON.stringify(payload).replace(/</g, '\\u003c') + ', "*");' +
        '<\/script></body></html>'
    });
  });
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
    const emailV2 = page.locator('#buyerEmail');
    await expect(emailV2).toBeVisible();
    await expect(page.locator('#buyerEmailLabel')).toHaveText('E-mail (opcional)');
    await expect(emailV2).not.toHaveAttribute('required', /.*/);
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

  test('Evento oficial candidato carrega sem iframe e aponta para Checkout oficial', async ({ page }) => {
    await page.goto('/evento/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 15000
    });

    const comprar = page.getByRole('link', {
      name: /Comprar ingresso|Garantir meu ingresso|Comprar agora/i
    }).first();

    await expect(comprar).toBeVisible();
    await expect(comprar).toHaveAttribute('href', /\/checkout\/\?evento=/);
    await expect(page.locator('iframe#app')).toHaveCount(0);

    expect(new URL(page.url()).pathname).toBe('/evento/');
    await expectNoTechnicalVisibleLinks(page);
  });

  test('Checkout oficial candidato carrega catalogo sem criar cobranca', async ({ page }) => {
    await page.goto('/checkout/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.getByRole('heading', { name: 'Roda de Samba Estilo Carioca' })).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByText('Seus dados')).toBeVisible();
    const emailOficial = page.locator('#buyerEmail');
    await expect(emailOficial).toBeVisible();
    await expect(page.locator('#buyerEmailLabel')).toHaveText('E-mail (opcional)');
    await expect(emailOficial).not.toHaveAttribute('required', /.*/);

    await page.locator('#typeSelect').selectOption('TIPO-IND');
    await page.locator('#lotSelect').selectOption('LOTE-1');

    await expect(page.locator('#summaryPrice')).toHaveText(/R\$\s*25,00/);
    await expect(page.locator('#eventBack')).toHaveAttribute('href', /\/evento\/\?evento=/);
    await expect(page.locator('iframe#app')).toHaveCount(0);

    expect(new URL(page.url()).pathname).toBe('/checkout/');
    await expectNoTechnicalVisibleLinks(page);
    await expect(page.locator('#payButton')).toBeVisible();
  });


  test('Portal do Produtor oficial renderiza login first-party', async ({ page }) => {
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#senha')).toBeVisible();
    await expect(page.locator('#loginButton')).toBeEnabled({ timeout: 15000 });
    await expect(page.locator('body')).not.toContainText('\\n');

    expect(new URL(page.url()).pathname).toBe('/produtor/');
    await expectNoTechnicalVisibleLinks(page);
  });

  test('Portal do Produtor usa PWA separado com identidade e icones oficiais', async ({ page }) => {
    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest-produtor.webmanifest'
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/assets/carioca-ticket-icon-192.png'
    );

    const pwa = await page.evaluate(async () => {
      const response = await fetch('/manifest-produtor.webmanifest?e2e=' + Date.now(), {
        cache: 'no-store'
      });
      const manifest = await response.json();

      async function measure(src) {
        return await new Promise(resolve => {
          const img = new Image();
          img.onload = () => resolve({
            ok: true,
            width: img.naturalWidth,
            height: img.naturalHeight
          });
          img.onerror = () => resolve({
            ok: false,
            width: 0,
            height: 0
          });
          img.src = src + '?e2e=' + Date.now();
        });
      }

      return {
        status: response.status,
        manifest,
        icon192: await measure('/assets/carioca-ticket-icon-192.png'),
        icon512: await measure('/assets/carioca-ticket-icon-512.png'),
        mask512: await measure('/assets/carioca-ticket-icon-maskable-512.png')
      };
    });

    expect(pwa.status).toBe(200);
    expect(pwa.manifest.id).toBe('/produtor/');
    expect(pwa.manifest.name).toBe('Carioca Ticket Produtor');
    expect(pwa.manifest.short_name).toBe('CT Produtor');
    expect(pwa.manifest.start_url).toBe('/produtor/');
    expect(pwa.manifest.scope).toBe('/');
    expect(pwa.manifest.display).toBe('standalone');
    expect(pwa.icon192).toEqual({ ok: true, width: 192, height: 192 });
    expect(pwa.icon512).toEqual({ ok: true, width: 512, height: 512 });
    expect(pwa.mask512).toEqual({ ok: true, width: 512, height: 512 });

    await expect(page.locator('.brand-logo-desktop')).toBeVisible();
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Portal do Produtor preserva codigo de indicacao do Parceiro CT', async ({ page }) => {
    await page.goto('/produtor/?ref=PARCEIROTESTE', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#registerReferralCode')).toHaveValue('PARCEIROTESTE');
    await expect(page.locator('#registerReferralHint')).not.toHaveClass(/hidden/);

    await page.locator('#showRegisterButton').click();
    await expect(page.getByRole('heading', { name: /Crie sua conta/i })).toBeVisible();
    await expect(page.locator('#registerReferralCode')).toHaveValue('PARCEIROTESTE');
    await expect(page.locator('body')).not.toContainText('\\n');

    expect(new URL(page.url()).pathname).toBe('/produtor/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Usuarios e Permissoes oficial permanece first-party', async ({ page }) => {
    await page.goto('/acessos/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('body')).toContainText(/Carioca Ticket/i);
    await expect(page.locator('body')).toContainText(/Usuários|Permissões|Acessos/i);
    await expect(page.locator('body')).not.toContainText('\\n');

    expect(new URL(page.url()).pathname).toBe('/acessos/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Carioca Bar oficial exige sessao sem sair do dominio first-party', async ({ page }) => {
    await page.goto('/bar/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gateDenied')).toBeVisible();
    await expect(page.locator('body')).toContainText(/Carioca Bar/i);
    await expect(page.locator('body')).toContainText(/Portal do Produtor/i);
    await expect(page.locator('body')).not.toContainText('\\n');

    expect(new URL(page.url()).pathname).toBe('/bar/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Minha Carioca rejeita retorno ctmc forjado sem sessao valida', async ({ page }) => {
    await mockMinhaCariocaSession(page, {
      sucesso: true,
      autenticado: false
    });

    const falso = {
      tipo: 'validarCodigo',
      ok: true,
      resultado: {
        sucesso: true,
        autenticado: true,
        token: 'TOKEN-FALSO-NAO-VALIDO',
        usuario: { nome: 'Conta Falsa' },
        compras: [{ eventoNome: 'EVENTO FORJADO' }]
      },
      erro: ''
    };

    const payload = Buffer.from(JSON.stringify(falso), 'utf8')
      .toString('base64url');

    await page.goto('/minha-carioca/conta/#ctmc=' + payload, {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.getByRole('heading', { name: /Minha Carioca/i })).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByPlaceholder(/Seu e-mail ou WhatsApp cadastrado/i)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('EVENTO FORJADO');
    await expect(page.locator('body')).not.toContainText('Conta Falsa');
  });

  test('Minha Carioca restaura somente token e busca compras novamente no backend', async ({ page }) => {
    await mockMinhaCariocaSession(page, {
      sucesso: true,
      autenticado: true,
      token: 'TOKEN-SESSAO-E2E',
      usuario: {
        nome: 'Cliente Homologacao',
        emailMascarado: 'c***e@example.invalid',
        whatsappMascarado: '•••• 0000'
      },
      compras: [
        {
          pedidoId: 'PED-E2E',
          eventoId: EVENT_ID,
          eventoNome: 'Roda de Samba Estilo Carioca',
          data: '11/10/2026',
          horario: '15h às 22h',
          local: 'Vevets Recepções',
          quantidade: 1,
          status: 'CONCLUIDO',
          link: '/minha-carioca/?pedido=PED-E2E&token=CONSULTA-E2E'
        }
      ]
    });

    await page.goto('/minha-carioca/conta/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('ct_mc_account_v6', JSON.stringify({
        exp: Date.now() + 3600000,
        token: 'TOKEN-SESSAO-E2E'
      }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible({
      timeout: 15000
    });

    const cached = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ct_mc_account_v6') || '{}')
    );

    expect(cached.token).toBe('TOKEN-SESSAO-E2E');
    expect(cached.data).toBeUndefined();
    expect(JSON.stringify(cached)).not.toContain('CONSULTA-E2E');
    expect(JSON.stringify(cached)).not.toContain('PED-E2E');
  });


  test('Eventos v2 bloqueia acesso sem sessao do produtor', async ({ page }) => {
    await page.goto('/eventos-v2/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /^Eventos$/i })).toBeVisible();
    await expect(page.locator('#estadoErro')).toContainText(/Acesso restrito|Portal do Produtor/i, {
      timeout: 15000
    });
    await expect(page.locator('#conteudo')).toHaveClass(/oculto/);
    await expect(page.locator('body')).not.toContainText('\\n');
    expect(new URL(page.url()).pathname).toBe('/eventos-v2/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Fornecedores oficial exige sessao e permissao', async ({ page }) => {
    await page.goto('/fornecedores/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gateDenied')).toBeVisible();
    await expect(page.locator('body')).toContainText(/Fornecedores/i);
    await expect(page.locator('body')).toContainText(/Portal do Produtor|Acesso restrito/i);
    await expect(page.locator('body')).not.toContainText('\\n');

    expect(new URL(page.url()).pathname).toBe('/fornecedores/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('CRM oficial exige sessao e permissao', async ({ page }) => {
    await page.goto('/crm/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gateDenied')).toBeVisible();
    await expect(page.locator('body')).toContainText(/Público & Clientes|CRM/i);
    await expect(page.locator('body')).toContainText(/Portal do Produtor|Acesso restrito/i);
    await expect(page.locator('body')).not.toContainText('\\n');

    expect(new URL(page.url()).pathname).toBe('/crm/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Saude das Vendas exige sessao quando aberta diretamente', async ({ page }) => {
    await page.goto('/saude-vendas/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#gateDenied')).toBeVisible();
    await expect(page.locator('body')).toContainText(/Saúde das Vendas|Acesso restrito/i);
    expect(new URL(page.url()).pathname).toBe('/saude-vendas/');
    await expectNoTechnicalVisibleLinks(page);
  });

  test('Saude das Vendas renderiza estado VERDE sem expor PII', async ({ page }) => {
    await page.addInitScript(({ key }) => {
      localStorage.setItem(key, JSON.stringify({
        token: 'TOKEN-TESTE-SAÚDE',
        expiraEm: '2099-01-01T00:00:00.000Z'
      }));
    }, { key: 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1' });

    await page.goto('/saude-vendas/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#healthTitle')).toHaveText('VERDE');
    await expect(page.locator('#sOrders')).toHaveText('4');
    await expect(page.locator('#sCritical')).toHaveText('0');
    await expect(page.locator('#sysTrigger')).toHaveText('ATIVO');
    await expect(page.locator('#sysAsaasCoverage')).toHaveText('COMPLETA');
    await expect(page.locator('#sysAsaasActive')).toHaveText('1');
    await expect(page.locator('#sysAsaasHosts')).toHaveText('webhook.cariocaticket.com.br');
    await expect(page.locator('#sysAsaasMissing')).toHaveText('Nenhum');
    await expect(page.locator('body')).not.toContainText(/CPF|E-mail do comprador|WhatsApp do comprador|access_token|credencialRef/i);
    expect(new URL(page.url()).pathname).toBe('/saude-vendas/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Reembolsos exige sessao quando aberto diretamente', async ({ page }) => {
    await page.goto('/reembolsos/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#gateDenied')).toBeVisible();
    await expect(page.locator('body')).toContainText(/Cancelamentos & Reembolsos|Acesso restrito/i);
    expect(new URL(page.url()).pathname).toBe('/reembolsos/');
    await expectNoTechnicalVisibleLinks(page);
  });

  test('Reembolsos renderiza pagamento e exige confirmacao antes de estorno', async ({ page }) => {
    await page.addInitScript(({ key }) => {
      localStorage.setItem(key, JSON.stringify({
        token: 'TOKEN-TESTE-REEMBOLSO',
        expiraEm: '2099-01-01T00:00:00.000Z'
      }));
    }, { key: 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1' });

    await page.goto('/reembolsos/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.getByText('Cliente Teste')).toBeVisible();
    await expect(page.getByText('R$ 25,00')).toBeVisible();
    await page.getByRole('button', { name: 'Analisar' }).click();
    await expect(page.locator('#executeRefund')).toBeDisabled();
    await page.locator('#reason').fill('Solicitação de cancelamento do comprador');
    await page.locator('#confirm').fill('REEMBOLSAR');
    await expect(page.locator('#executeRefund')).toBeEnabled();
    await expect(page.locator('body')).not.toContainText(/CVV|número do cartão|cardNumber/i);
    expect(new URL(page.url()).pathname).toBe('/reembolsos/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Financeiro oficial exige sessao e evento autorizado', async ({ page }) => {
    await page.goto('/financeiro/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gateDenied')).toBeVisible();
    await expect(page.locator('body')).toContainText(/Financeiro/i);
    await expect(page.locator('body')).toContainText(/Portal do Produtor|Acesso restrito/i);
    await expect(page.locator('body')).not.toContainText('\\n');
    expect(new URL(page.url()).pathname).toBe('/financeiro/');
    await expectNoTechnicalVisibleLinks(page);
  });

  test('Relatorios oficial exige sessao e evento autorizado', async ({ page }) => {
    await page.goto('/relatorios/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gateDenied')).toBeVisible();
    await expect(page.locator('body')).toContainText(/Relatórios/i);
    await expect(page.locator('body')).toContainText(/Portal do Produtor|Acesso restrito/i);
    await expect(page.locator('body')).not.toContainText('\\n');
    expect(new URL(page.url()).pathname).toBe('/relatorios/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Minhas Vendas do comissionado exige sessao', async ({ page }) => {
    await page.goto('/comissionado/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.getByText(/Minhas Vendas/i).first()).toBeVisible();
    await expect(page.locator('#conteudoPrincipal')).toHaveClass(/oculto/);
    await expect(page.locator('#conteudoInicial')).toBeVisible();
    await expect(page.locator('body')).toContainText(/sessão|acesso|erro|não foi possível/i, {
      timeout: 15000
    });
    await expect(page.locator('body')).not.toContainText('\\n');
    expect(new URL(page.url()).pathname).toBe('/comissionado/');
    await expectNoTechnicalVisibleLinks(page);
  });


  test('Comissoes do evento exige sessao e permissao', async ({ page }) => {
    await page.goto('/comissoes/?evento=' + encodeURIComponent(EVENT_ID), {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gateDenied')).toBeVisible();
    await expect(page.locator('body')).toContainText(/Comissões/i);
    await expect(page.locator('body')).toContainText(/Central|Acesso restrito|Portal/i);
    await expect(page.locator('body')).not.toContainText('\\n');
    expect(new URL(page.url()).pathname).toBe('/comissoes/');
    await expectNoTechnicalVisibleLinks(page);
  });

});
