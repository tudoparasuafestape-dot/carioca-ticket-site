const { test, expect } = require('@playwright/test');

const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';
const EVENT_ACTIVE = 'EVT-E2E-ATIVO-20261011';
const EVENT_ENDED = 'EVT-E2E-ENCERRADO-20260823';
const EVENT_SLOW = 'EVT-E2E-LENTO-20261231';
const ONE_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=';

function sessionFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    usuario: {
      id: 'USR-QA',
      nome: 'Operador QA',
      email: 'qa@example.invalid'
    },
    produtores: [{
      id: 'PROD-QA',
      nomeFantasia: 'Produtor QA',
      perfil: 'ADMIN',
      eventos: [
        { id: EVENT_ACTIVE, detalhePendente: true },
        { id: EVENT_ENDED, detalhePendente: true },
        { id: EVENT_SLOW, detalhePendente: true }
      ]
    }],
    sessao: {
      expiraEm: '2099-01-01T00:00:00.000Z'
    }
  };
}

function catalogFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    produtorId: 'PROD-QA',
    eventos: [
      {
        id: EVENT_ACTIVE,
        nome: 'Roda de Samba Estilo Carioca',
        data: '11/10/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE',
        status: 'ATIVO',
        capacidade: 400
      },
      {
        id: EVENT_ENDED,
        nome: 'Samba 90',
        data: '23/08/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE',
        status: 'ENCERRADO',
        capacidade: 400
      },
      {
        id: EVENT_SLOW,
        nome: 'Evento de Teste Lento',
        data: '31/12/2026',
        horario: '20h',
        local: 'Local QA',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE',
        status: 'RASCUNHO',
        capacidade: 100
      }
    ]
  };
}

function painelFixture(eventoId) {
  const ev = catalogFixture().eventos.find(item => item.id === eventoId) || catalogFixture().eventos[0];
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    painel: {
      evento: ev,
      resumo: {
        receita: 'R$ 330,00',
        ingressosValidos: 14,
        presentes: 4,
        vagasRestantes: Math.max(0, Number(ev.capacidade || 0) - 14),
        ingressosPagos: 12,
        cortesias: 2,
        ticketMedio: 'R$ 27,50',
        capacidade: Number(ev.capacidade || 0),
        percentualOcupacao: 4,
        pendentes: 10,
        cancelados: 12,
        totalIngressos: 26,
        percentualCheckin: 29
      },
      checkinsRecentes: [{
        nome: 'VINICIUS MEDEIROS DOS SANTOS',
        tipo: 'Individual',
        codigo: 'CT-QA-001',
        data: '19/09/2026 00:05:51',
        horario: '00:05:51'
      }],
      atualizadoEm: '21/09/2026 17:03:15'
    }
  };
}

function consultaResult(status) {
  const upper = String(status || 'VALIDO').toUpperCase();
  const pending = upper === 'PENDENTE';
  const cancelled = upper === 'CANCELADO';
  const valid = upper === 'VALIDO';
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    mensagem: '1 ingresso encontrado.',
    filtroEvento: {
      eventoId: EVENT_ACTIVE,
      eventoNome: 'Roda de Samba Estilo Carioca',
      pesquisarTodos: false
    },
    ingressos: [{
      id: 'ING-QA-' + upper,
      nome: 'Cliente ' + upper,
      telefone: '81999990000',
      tipo: 'Individual',
      codigo: 'CT-QA-' + upper,
      status: upper,
      statusClasse: upper,
      dataCompra: '21/09/2026 10:00:00',
      dataCheckin: upper === 'UTILIZADO' ? '21/09/2026 12:00:00' : '',
      valorPago: 'R$ 25,00',
      vendaId: 'VENDA-QA-' + upper,
      ingressoCompartilhamentoUrl: valid ? '/ingresso/?codigo=CT-QA-VALIDO&sig=abcdefghijklmnop' : '',
      ingressoUrl: valid ? '/ingresso/?codigo=CT-QA-VALIDO&sig=abcdefghijklmnop' : '',
      whatsappUrl: valid ? 'https://wa.me/5581999990000' : '',
      pdfUrl: '',
      compartilhamentoPermitido: valid
    }]
  };
}

function ticketResult(valid) {
  return {
    sucesso: true,
    ingresso: {
      codigo: valid ? 'CT-QA-VALIDO' : 'CT-QA-PENDENTE',
      nome: 'Cliente QA',
      tipo: 'Individual',
      lote: 'Pré-venda',
      status: valid ? 'VÁLIDO' : 'PENDENTE',
      statusClasse: valid ? 'valido' : 'pendente',
      qrUrl: valid ? ONE_PIXEL : ''
    },
    evento: {
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE'
    },
    visual: {},
    seguranca: {
      autorizaEntrada: valid,
      mensagem: valid
        ? 'Este ingresso é individual e permite somente uma entrada.'
        : 'Ingresso aguardando confirmação do pagamento. A entrada ainda não está autorizada.'
    }
  };
}

async function seedSession(page, token = 'TOKEN-QA-NAO-REAL') {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ key, tokenValue }) => {
    const payload = JSON.stringify({
      token: tokenValue,
      expiraEm: '2099-01-01T00:00:00.000Z'
    });
    localStorage.setItem(key, payload);
    sessionStorage.setItem(key, payload);
  }, { key: STORAGE, tokenValue: token });
}

async function installGatewayMock(page, options = {}) {
  const token = options.token || 'TOKEN-QA-NAO-REAL';
  let selectedAdminEvent = EVENT_ACTIVE;

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
        if (method === 'ctCentralAcessoObterCapacidadesPROD') {
          resultado = {
            sucesso: true,
            loginEmailSenha: { habilitado: true },
            cadastro: { habilitado: true },
            recuperacaoSenha: { habilitado: true },
            google: { habilitado: false }
          };
        } else if (method === 'ctMarcaOficialObterDataUriPROD') {
          resultado = ONE_PIXEL;
        } else if (method === 'ctCentralAcessoObterFirebaseConfigPROD') {
          resultado = { sucesso: false };
        } else if (method === 'ctPortalProdutorRestaurarSessaoIsoladaPROD') {
          resultado = sessionFixture();
        } else if (method === 'ctPortalProdutorCarregarCatalogoEventosPROD') {
          resultado = catalogFixture();
        } else if (method === 'ctPortalProdutorCarregarPainelIsoladoPROD') {
          const eventId = String(args[2] || '');
          if (eventId === EVENT_SLOW && options.slowPanel) {
            await new Promise(resolve => setTimeout(resolve, 13500));
          }
          resultado = painelFixture(eventId);
        } else if (method === 'ctCentralOperacionalCriarHandoffPROD') {
          resultado = {
            sucesso: true,
            handoff: 'HANDOFF_QA_ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            destino: String(args[1] || ''),
            expiraEm: '2099-01-01T00:00:00.000Z'
          };
        } else if (method === 'ctConsultaIngressosOperacionalPROD') {
          const term = String(args[2] || '').toUpperCase();
          if (term.includes('NEGADO')) {
            resultado = {
              sucesso: false,
              autenticado: true,
              autorizado: false,
              mensagem: 'Você não possui autorização para consultar ingressos deste evento.',
              ingressos: []
            };
          } else if (term.includes('PEND')) {
            resultado = consultaResult('PENDENTE');
          } else if (term.includes('CANCEL')) {
            resultado = consultaResult('CANCELADO');
          } else {
            resultado = consultaResult('VALIDO');
          }
        } else if (method === 'ctEventosOperacionalListarSeguraPROD') {
          const eventos = catalogFixture().eventos.map(ev => ({
            ...ev,
            ativo: String(ev.id) === String(selectedAdminEvent),
            publicacao: {
              publicado: String(ev.id) === String(EVENT_ACTIVE),
              prontoPublicar: String(ev.id) === String(EVENT_ACTIVE),
              pendencias: [],
              checkoutUrl: '/checkout/?evento=' + encodeURIComponent(ev.id)
            }
          }));
          resultado = {
            sucesso: true,
            autenticado: true,
            autorizado: true,
            eventos,
            total: eventos.length,
            eventoAtivo: eventos.find(ev => ev.id === selectedAdminEvent) || null,
            eventoSelecionado: eventos.find(ev => ev.id === selectedAdminEvent) || null,
            publicados: 1,
            listagemRapida: true
          };
        } else if (method === 'ctEventosOperacionalSelecionarSeguraPROD') {
          expect(String(args[0] || '')).toBe(token);
          selectedAdminEvent = String(args[1] || '');
          resultado = {
            sucesso: true,
            autenticado: true,
            autorizado: true,
            mensagem: 'Evento selecionado para gestão.'
          };
        } else if (method === 'logoutUsuarioCT2') {
          resultado = { sucesso: true };
        } else {
          resultado = { sucesso: false, mensagem: 'Método não previsto no QA: ' + method };
        }
      } else if (action === 'consultarIngressoSeguro') {
        const code = String(params.get('codigo') || '').toUpperCase();
        resultado = ticketResult(code.includes('VALIDO'));
      } else {
        ok = false;
        erro = 'Ação não prevista no QA: ' + action;
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
        '<!doctype html><html><body><script>' +
        'window.top.postMessage(' + payload + ', "*");' +
        '<\/script></body></html>'
    });
  });
}

test.describe('Matriz crítica de homologação', () => {
  test('Portal usa seletor CT, mostra múltiplos eventos e não exibe ID técnico', async ({ page }) => {
    await installGatewayMock(page);
    await seedSession(page);

    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#portalView')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventPickerButton')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventPickerTitle')).toHaveText('Selecione um evento');
    await expect(page.locator('#refreshButton')).toBeDisabled();

    await page.locator('#eventPickerButton').click();
    await expect(page.locator('#eventPickerBackdrop')).toHaveClass(/show/);
    await expect(page.locator('#eventPickerList')).toContainText('Roda de Samba Estilo Carioca');
    await expect(page.locator('#eventPickerList')).toContainText('Samba 90');
    await expect(page.locator('#eventPickerList')).toContainText('ENCERRADO');
    await expect(page.locator('#eventPickerList')).not.toContainText(EVENT_ACTIVE);
    await expect(page.locator('#eventPickerList')).not.toContainText(EVENT_ENDED);

    await page.locator('.event-picker-option').filter({ hasText: 'Samba 90' }).click();
    await expect(page.locator('#eventPickerTitle')).toHaveText('Samba 90');
    await expect(page.locator('#eventPickerMeta')).toContainText('23/08/2026');
    await expect(page.locator('#eventPickerMeta')).toContainText('ENCERRADO');
    await expect(page.locator('#refreshButton')).toBeEnabled();
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventName')).toHaveText('Samba 90');
    await expect(page.locator('#eventStatusBadge')).toHaveText('ENCERRADO');
    await expect(page.locator('#checkinModeLabel')).toHaveText('histórico');
    await expect(page.locator('#miniPendingLabel')).toHaveText('Aguardando check-in');
    await expect(page.locator('#checkinList')).toContainText('Vinicius Medeiros dos Santos');
    await expect(page.locator('#checkinList')).toContainText('19/09 · 00:05:51');

    await page.locator('#eventPickerButton').click();
    await page.locator('.event-picker-option').filter({ hasText: 'Evento de Teste Lento' }).click();
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventStatusBadge')).toHaveText('RASCUNHO');
    await expect(page.locator('#checkinModeLabel')).toHaveText('pré-evento');

    const native = await page.locator('#eventSelect').evaluate(el => {
      const s = getComputedStyle(el);
      return { opacity: s.opacity, width: s.width, height: s.height };
    });
    expect(native.opacity).toBe('0');

    const width = page.viewportSize() && page.viewportSize().width || 1200;
    if (width <= 760) {
      const position = await page.locator('.topbar').evaluate(el => getComputedStyle(el).position);
      expect(position).toBe('static');
    }
  });

  test('Portal encerra loading lento e ignora resposta tardia', async ({ page }) => {
    test.setTimeout(30000);
    await installGatewayMock(page, { slowPanel: true });
    await seedSession(page);

    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#portalView')).toBeVisible({ timeout: 15000 });
    await page.locator('#eventPickerButton').click();
    await page.locator('.event-picker-option').filter({ hasText: 'Evento de Teste Lento' }).click();

    await expect(page.locator('#loadingOverlay')).toHaveClass(/show/);
    await expect(page.locator('#portalMessage')).toContainText(
      'A consulta está demorando mais do que deveria',
      { timeout: 13000 }
    );
    await expect(page.locator('#loadingOverlay')).not.toHaveClass(/show/);

    await page.waitForTimeout(1800);
    await expect(page.locator('#dashboard')).toHaveClass(/hidden/);
  });

  test('Eventos seleciona contexto com RPC seguro e confirmação CT', async ({ page }) => {
    await installGatewayMock(page);
    await seedSession(page);

    let nativeDialog = false;
    page.on('dialog', async dialog => {
      nativeDialog = true;
      await dialog.dismiss();
    });

    await page.goto('/eventos-v2/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#conteudo')).not.toHaveClass(/oculto/, { timeout: 15000 });
    await expect(page.locator('#listaEventos')).toContainText('Roda de Samba Estilo Carioca');
    await expect(page.locator('#listaEventos')).toContainText('Evento de Teste Lento');

    const card = page.locator('.evento-card').filter({ hasText: 'Evento de Teste Lento' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Selecionar para gestão' }).click();

    await expect(page.locator('#ctConfirmDialog')).toBeVisible();
    await expect(page.locator('#ctConfirmText')).toContainText('selecionar este evento');
    await page.locator('#ctConfirmOk').click();

    await expect(page.locator('#eventoAtivoNome')).toHaveText('Evento de Teste Lento', {
      timeout: 15000
    });
    await expect(page.locator('#ctToast')).toContainText('Evento selecionado para gestão');
    expect(nativeDialog).toBe(false);
    await expect(page.locator('body')).not.toContainText(EVENT_SLOW);
  });

  test('Consulta aplica matriz VÁLIDO, PENDENTE, CANCELADO e acesso negado', async ({ page }) => {
    await installGatewayMock(page);
    await seedSession(page);

    await page.goto(
      '/consulta/?evento=' + encodeURIComponent(EVENT_ACTIVE) +
      '&eventoNome=' + encodeURIComponent('Roda de Samba Estilo Carioca'),
      { waitUntil: 'domcontentloaded' }
    );

    await expect(page.locator('#eventName')).toHaveText('Roda de Samba Estilo Carioca');

    await page.locator('#term').fill('Valido');
    await page.locator('#searchButton').click();
    await expect(page.locator('#results')).toContainText('CT-QA-VALIDO');
    await expect(page.getByRole('link', { name: 'Abrir ingresso' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Enviar no WhatsApp' })).toBeVisible();

    await page.locator('#term').fill('Pendente');
    await page.locator('#searchButton').click();
    await expect(page.locator('#results')).toContainText('CT-QA-PENDENTE');
    await expect(page.locator('#results')).toContainText('Aguardando confirmação do pagamento');
    await expect(page.getByRole('link', { name: 'Abrir ingresso' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Enviar no WhatsApp' })).toHaveCount(0);

    await page.locator('#term').fill('Cancelado');
    await page.locator('#searchButton').click();
    await expect(page.locator('#results')).toContainText('CT-QA-CANCELADO');
    await expect(page.locator('#results')).toContainText('Ingresso cancelado');
    await expect(page.getByRole('link', { name: 'Abrir ingresso' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Enviar no WhatsApp' })).toHaveCount(0);

    await page.locator('#term').fill('Negado');
    await page.locator('#searchButton').click();
    await expect(page.locator('#message')).toContainText(/não possui autorização|não autorizado/i);
    await expect(page.locator('#results')).toBeEmpty();
  });

  test('Ingresso PENDENTE não mostra QR nem ações; VÁLIDO mostra', async ({ page }) => {
    await installGatewayMock(page);

    await page.goto('/ingresso/?codigo=CT-QA-PENDENTE&sig=abcdefghijklmnop', {
      waitUntil: 'domcontentloaded'
    });
    await expect(page.locator('#ticket-view')).toHaveClass(/show/, { timeout: 15000 });
    await expect(page.locator('#ticket-view')).toContainText('PENDENTE');
    await expect(page.locator('#ticket-view')).toContainText(/aguardando confirmação do pagamento/i);
    await expect(page.locator('.qr')).toHaveCount(0);
    await expect(page.locator('#share-whatsapp')).toHaveCount(0);
    await expect(page.locator('#share-ticket')).toHaveCount(0);
    await expect(page.locator('#save-pdf')).toHaveCount(0);

    await page.goto('/ingresso/?codigo=CT-QA-VALIDO&sig=abcdefghijklmnop', {
      waitUntil: 'domcontentloaded'
    });
    await expect(page.locator('#ticket-view')).toHaveClass(/show/, { timeout: 15000 });
    await expect(page.locator('#ticket-view')).toContainText('VÁLIDO');
    await expect(page.locator('.qr')).toBeVisible();
    await expect(page.locator('#share-whatsapp')).toBeVisible();
    await expect(page.locator('#share-ticket')).toBeVisible();
    await expect(page.locator('#save-pdf')).toBeVisible();
  });
});
