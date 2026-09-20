const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const EVENT_ID = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=';

function portalSession() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    usuario: {
      id: 'USR-E2E',
      nome: 'Operador Homologacao',
      email: 'homologacao@example.invalid'
    },
    produtores: [
      {
        id: 'PROD-E2E',
        nomeFantasia: 'Produtor Homologacao',
        perfil: 'ADMIN',
        eventos: [
          {
            id: EVENT_ID,
            nome: 'Roda de Samba Estilo Carioca',
            data: '11/10/2026',
            horario: '15h às 22h',
            local: 'Vevets Recepções',
            cidade: 'Jaboatão dos Guararapes',
            uf: 'PE',
            status: 'ATIVO',
            capacidade: 400
          }
        ]
      }
    ]
  };
}

function centralContext(token) {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    token,
    usuario: {
      id: 'USR-E2E',
      nome: 'Operador Homologacao'
    },
    eventos: [
      {
        id: EVENT_ID,
        nome: 'Roda de Samba Estilo Carioca',
        data: '11/10/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE',
        produtorId: 'PROD-E2E',
        perfil: 'ADMIN',
        modulosPermitidos: [
          'CHECKIN',
          'CONSULTA_INGRESSOS',
          'PORTAL_PRODUTOR',
          'USUARIOS',
          'VENDAS',
          'BAR'
        ]
      }
    ],
    modulosPermitidosGerais: [
      'CHECKIN',
      'CONSULTA_INGRESSOS',
      'PORTAL_PRODUTOR',
      'USUARIOS',
      'VENDAS',
      'BAR'
    ]
  };
}

function painelFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    painel: {
      evento: {
        nome: 'Roda de Samba Estilo Carioca',
        data: '11/10/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE'
      },
      resumo: {
        receita: 'R$ 0,00',
        ingressosValidos: 0,
        presentes: 0,
        vagasRestantes: 400,
        ingressosPagos: 0,
        cortesias: 0,
        ticketMedio: 'R$ 0,00',
        capacidade: 400,
        percentualOcupacao: 0,
        pendentes: 0,
        cancelados: 0,
        totalIngressos: 0,
        percentualCheckin: 0
      },
      checkinsRecentes: [],
      atualizadoEm: '20/09/2026 08:00:00'
    }
  };
}

function vendasFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    eventoIdSolicitado: EVENT_ID,
    eventoIdUtilizado: EVENT_ID,
    origemEvento: 'URL',
    evento: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE',
      capacidade: 400,
      status: 'ATIVO'
    },
    tipos: [
      {
        id: 'TIPO-IND',
        nome: 'Individual',
        descricao: 'Ingresso individual',
        preco: 'R$ 25,00',
        precoNumero: 25,
        capacidadePorVenda: 1
      }
    ],
    lotes: [
      {
        id: 'LOTE-1',
        tipoId: 'TIPO-IND',
        nome: 'Pré-venda',
        preco: 'R$ 25,00',
        precoNumero: 25
      }
    ],
    formasPagamento: ['PIX', 'DINHEIRO'],
    resumoHoje: {
      quantidade: 0,
      faturamento: 'R$ 0,00',
      pagos: 0,
      cortesias: 0
    },
    resumoEvento: {
      vendas: 0,
      acessos: 0,
      faturamento: 'R$ 0,00',
      cortesias: 0
    },
    atualizadoEm: '20/09/2026 08:00:00'
  };
}

async function installMock(page, state) {
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

    let resultado = null;
    let ok = true;
    let erro = '';

    try {
      if (action === 'portalRpc') {
        switch (method) {
          case 'ctCentralAcessoObterCapacidadesPROD':
            resultado = {
              sucesso: true,
              loginEmailSenha: { habilitado: true },
              cadastro: { habilitado: true },
              recuperacaoSenha: { habilitado: true },
              google: { habilitado: false }
            };
            break;

          case 'ctMarcaOficialObterDataUriPROD':
            resultado = ONE_PIXEL_PNG;
            break;

          case 'ctCentralAcessoObterFirebaseConfigPROD':
            resultado = { sucesso: false };
            break;

          case 'ctPortalProdutorRestaurarSessaoIsoladaPROD':
            expect(String(args[0] || '')).toBe(state.token);
            resultado = portalSession();
            break;

          case 'ctPortalProdutorCarregarPainelIsoladoPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[2] || '')).toBe(EVENT_ID);
            resultado = painelFixture();
            break;

          case 'ctCentralOperacionalCriarHandoffPROD': {
            expect(String(args[0] || '')).toBe(state.token);
            const destino = String(args[1] || '');
            resultado = {
              sucesso: true,
              handoff: 'HANDOFF_' + destino + '_ABCDEFGHIJKLMNOPQRSTUVWXYZ',
              destino,
              expiraEm: '2099-01-01T00:00:00.000Z'
            };
            break;
          }

          case 'ctCentralVendasCarregarSeguraPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = vendasFixture();
            break;

          case 'ctCentralVendasConfirmarSeguraPROD':
            state.transactionCalls += 1;
            throw new Error('Teste nao deve confirmar venda.');

          case 'logoutUsuarioCT2':
            resultado = { sucesso: true };
            break;

          default:
            resultado = {
              sucesso: false,
              mensagem: 'Metodo nao previsto no E2E autenticado: ' + method
            };
        }
      } else if (action === 'centralConsumirHandoff') {
        resultado = {
          sucesso: true,
          autenticado: true,
          autorizado: true,
          token: state.token,
          expiraEm: '2099-01-01T00:00:00.000Z'
        };
      } else if (action === 'centralRestaurarSessao') {
        expect(String(params.get('token') || '')).toBe(state.token);
        resultado = centralContext(state.token);
      } else if (action === 'centralLogout') {
        resultado = { sucesso: true };
      } else {
        ok = false;
        erro = 'Acao nao prevista no E2E autenticado: ' + action;
      }
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
        '<!doctype html><html><body>' +
        '<script>window.top.postMessage(' + payload + ', "*");<\/script>' +
        '</body></html>'
    });
  });
}

async function seedSession(page, token) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: STORAGE,
      value: {
        token,
        expiraEm: '2099-01-01T00:00:00.000Z'
      }
    }
  );
}

async function expectNoTechnicalVisibleLinks(page) {
  const hrefs = await page.locator('a[href]').evaluateAll(els =>
    els.map(el => el.getAttribute('href') || '')
  );

  expect(
    hrefs.filter(href =>
      /script\.google\.com|googleusercontent\.com|github\.io/i.test(href)
    )
  ).toEqual([]);
}

test.describe('Jornada operacional autenticada', () => {
  test.skip(!BRANCH_MODE, 'Executa localmente na branch sem usar credenciais reais.');

  test('Portal -> Central -> Vendas -> voltar -> logout sem transacao', async ({ page }) => {
    const state = {
      token: 'CT-E2E-TOKEN-NAO-REAL',
      transactionCalls: 0
    };

    await installMock(page, state);
    await seedSession(page, state.token);

    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#portalView')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#helloName')).toContainText('Operador Homologacao');
    await expect(page.locator('#eventSelect')).toBeVisible();

    await page.locator('#eventSelect').selectOption(EVENT_ID);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventName')).toHaveText('Roda de Samba Estilo Carioca');

    const centralLink = page.locator('#centralMobileLink');
    await expect(centralLink).toHaveAttribute('href', /\/central\/#ct_handoff=/);
    await expect(page.locator('#accessManagementLink')).toHaveAttribute(
      'href',
      /\/acessos\/#ct_handoff=/
    );
    await expectNoTechnicalVisibleLinks(page);

    /*
     * O Portal usa a URL absoluta oficial por seguranca. Na homologacao da
     * branch preservamos path/hash do handoff, mas mantemos a navegacao no
     * servidor local para testar exatamente o codigo candidato.
     */
    const centralHref = await centralLink.getAttribute('href');
    const centralUrl = new URL(centralHref);
    await page.goto(
      centralUrl.pathname + centralUrl.search + centralUrl.hash,
      { waitUntil: 'domcontentloaded' }
    );
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventSelect')).toHaveValue(EVENT_ID);

    const vendas = page.locator('#mVendas');
    const bar = page.locator('#mBar');

    await expect(vendas).toHaveAttribute(
      'href',
      new RegExp('/vendas/\\?evento=' + EVENT_ID)
    );
    await expect(vendas).toHaveAttribute('aria-disabled', 'false');

    await expect(bar).toHaveAttribute('href', '#');
    await expect(bar).toHaveAttribute('aria-disabled', 'true');
    await expect(bar).toHaveClass(/disabled/);

    await expect(page.locator('#mCheckin')).toHaveAttribute('href', /\/checkin\//);
    await expect(page.locator('#mConsulta')).toHaveAttribute('href', /\/consulta\//);
    await expectNoTechnicalVisibleLinks(page);

    await vendas.click();
    await expect(page).toHaveURL(/\/vendas\/\?evento=/);
    await expect(
      page.getByText('Roda de Samba Estilo Carioca').first()
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#formularioVenda')).toBeVisible();
    await expect(page.getByRole('link', { name: /Voltar para a Central/i })).toHaveAttribute(
      'href',
      '/central/'
    );
    await expectNoTechnicalVisibleLinks(page);
    expect(state.transactionCalls).toBe(0);

    await page.getByRole('link', { name: /Voltar para a Central/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#logout').click();
    await expect(page).toHaveURL(/\/produtor\//, { timeout: 10000 });
    await expect(page.locator('#loginView')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#portalView')).toHaveClass(/hidden/);

    const stored = await page.evaluate(key => ({
      local: localStorage.getItem(key),
      session: sessionStorage.getItem(key)
    }), STORAGE);

    expect(stored.local).toBeNull();
    expect(stored.session).toBeNull();
    expect(state.transactionCalls).toBe(0);
  });
});
