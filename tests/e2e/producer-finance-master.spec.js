import { test, expect } from '@playwright/test';

const BRANCH_MODE = String(process.env.CT_BRANCH_MODE || '') === '1';
const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';
const EVENT_ID = 'EVT-FIN-E2E';
const PRODUCER_ID = 'PROD-FIN-E2E';

function publicRequest(state) {
  if (!state.request) return null;
  return {
    solicitacaoId: state.request.solicitacaoId,
    tipo: 'ANTECIPACAO',
    produtorId: PRODUCER_ID,
    produtorNome: 'Produtor Homologação',
    eventoId: EVENT_ID,
    evento: { id: EVENT_ID, nome: 'Evento Financeiro E2E' },
    valor: state.request.valor,
    status: state.request.status,
    solicitadoPorUsuarioId: 'USR-PROD-E2E',
    solicitadoPorPerfil: 'PRODUTOR_TITULAR',
    criadoEm: '2026-09-24T19:00:00.000Z',
    atualizadoEm: '2026-09-24T19:00:00.000Z',
    motivo: '',
    financeiro: {
      vendasElegiveis: 1250,
      maximoAntecipavel: 1000,
      reservaSeguranca: 250,
      taxaCtPercentual: 3.5,
      taxaCtValor: Number((state.request.valor * 0.035).toFixed(2)),
      valorLiquidoProdutor: Number((state.request.valor * 0.965).toFixed(2)),
      custoProvider: null,
      margemBrutaCt: null,
      providerPendenteIntegracao: true
    }
  };
}

function portalSummary(state) {
  const aberto = state.request && ['SOLICITADA','EM_ANALISE','APROVADA_MASTER'].includes(state.request.status)
    ? state.request.valor
    : 0;
  const quantidade = aberto > 0 ? 1 : 0;
  const base = state.eligibleBase;
  const maximo = base >= 500 ? Number((base * 0.8).toFixed(2)) : 0;

  return {
    sucesso: true,
    autorizado: true,
    produtorId: PRODUCER_ID,
    eventoId: EVENT_ID,
    perfil: state.producerProfile,
    permissoes: {
      verSaldo: true,
      verExtrato: true,
      solicitarAntecipacao: state.canRequest === true,
      aprovarAntecipacao: false,
      registrarPatrocinio: false,
      adicionarCapitalProprio: false,
      planejarPagamento: false,
      executarPagamento: false
    },
    financeiro: {
      configurado: true,
      modoConta: 'SUBCONTA_PLATAFORMA',
      movimentacaoRealHabilitada: false,
      aportePixHabilitado: false,
      repasseAutomaticoHabilitado: false
    },
    vendas: {
      confirmado: base,
      recebido: base,
      aReceber: 0,
      vendasElegiveisAntecipacao: base
    },
    ledger: {
      saldoOperacional: base,
      porOrigem: { VENDAS_INGRESSOS_ONLINE: base }
    },
    solicitacoes: {
      antecipacoesAbertas: aberto,
      antecipacoesAbertasQuantidade: quantidade,
      pagamentosPlanejados: 0,
      pagamentosAguardandoAprovacao: 0,
      totalSolicitacoes: quantidade
    },
    antecipacao: {
      minimoVendas: 500,
      percentualMaximo: 80,
      reservaPercentual: 20,
      taxaCtPercentual: 3.5,
      prazoEnvioDiasUteis: 2,
      repasseNormalDiasUteis: 3,
      repasseNormalSemTaxaAntecipacao: true,
      baseElegivel: base,
      maximoBruto: maximo,
      jaSolicitadoAberto: aberto,
      disponivelSolicitar: Math.max(0, maximo - aberto),
      providerHabilitado: false
    },
    atualizadoEm: '24/09/2026 16:45:00',
    versaoModulo: '0.3.0'
  };
}

async function installMock(page, state) {
  await page.route('https://script.google.com/**', async route => {
    const params = new URLSearchParams(route.request().postData() || '');
    const id = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    const method = String(params.get('metodo') || '');
    let args = [];
    try { args = JSON.parse(params.get('argsJson') || '[]'); } catch (_) {}

    let ok = true, resultado = null, erro = '';

    try {
      expect(action).toBe('portalRpc');

      if (method === 'ctPortalProdutorRestaurarSessaoIsoladaPROD') {
        expect(String(args[0] || '')).toBe(state.producerToken);
        resultado = {
          sucesso: true,
          autenticado: true,
          autorizado: true,
          usuario: { id:'USR-PROD-E2E', nome:'Produtor Homologação', perfil:state.producerProfile },
          produtores: [{
            id: PRODUCER_ID,
            nomeFantasia: 'Produtor Homologação',
            perfil: state.producerProfile,
            eventos: [{ id:EVENT_ID, nome:'Evento Financeiro E2E', status:'ATIVO' }]
          }]
        };
      } else if (method === 'ctContaCariocaPayPortalResumoPROD') {
        expect(String(args[0] || '')).toBe(state.producerToken);
        expect(String(args[1] || '')).toBe(EVENT_ID);
        state.summaryCalls += 1;
        resultado = portalSummary(state);
      } else if (method === 'ctContaCariocaPayPortalSolicitarAntecipacaoPROD') {
        expect(String(args[0] || '')).toBe(state.producerToken);
        expect(String(args[1] || '')).toBe(EVENT_ID);
        expect(state.canRequest).toBe(true);
        const valor = Number(args[2] || 0);
        expect(valor).toBeGreaterThan(0);
        expect(valor).toBeLessThanOrEqual(1000);
        expect(String(args[3] || '')).toMatch(/^PORTAL-ANT-/);
        state.requestCalls += 1;
        state.request = {
          solicitacaoId: 'CCP-ANT-E2E',
          valor,
          status: 'SOLICITADA'
        };
        resultado = {
          sucesso: true,
          jaExistia: false,
          solicitacao: publicRequest(state),
          exigeAprovacaoMaster: true,
          chamouProvider: false,
          movimentouDinheiro: false
        };
      } else if (method === 'ctContaCariocaPayMasterContarPendentesPROD') {
        expect(String(args[0] || '')).toBe(state.adminToken);
        const status = state.request && state.request.status;
        resultado = {
          sucesso: true,
          autorizado: true,
          contagem: {
            solicitadas: status === 'SOLICITADA' ? 1 : 0,
            emAnalise: status === 'EM_ANALISE' ? 1 : 0,
            abertas: ['SOLICITADA','EM_ANALISE'].includes(status) ? 1 : 0,
            notificacoesNaoLidas: status === 'SOLICITADA' ? 1 : 0
          },
          providerAcionado: false,
          movimentouDinheiro: false
        };
      } else if (method === 'ctContaCariocaPayMasterListarPROD') {
        expect(String(args[0] || '')).toBe(state.adminToken);
        resultado = {
          sucesso: true,
          autorizado: true,
          itens: state.request ? [publicRequest(state)] : [],
          total: state.request ? 1 : 0,
          providerAcionado: false,
          movimentouDinheiro: false
        };
      } else if (method === 'ctContaCariocaPayMasterDetalharPROD') {
        expect(String(args[0] || '')).toBe(state.adminToken);
        expect(String(args[1] || '')).toBe('CCP-ANT-E2E');
        resultado = {
          sucesso: true,
          autorizado: true,
          solicitacao: publicRequest(state),
          providerAcionado: false,
          movimentouDinheiro: false
        };
      } else if (method === 'ctContaCariocaPayMasterDecidirPROD') {
        expect(String(args[0] || '')).toBe(state.adminToken);
        expect(String(args[1] || '')).toBe('CCP-ANT-E2E');
        const decision = String(args[2] || '');
        state.masterActions.push(decision);
        if (decision === 'INICIAR_ANALISE') {
          expect(state.request.status).toBe('SOLICITADA');
          state.request.status = 'EM_ANALISE';
        } else if (decision === 'APROVAR') {
          expect(state.request.status).toBe('EM_ANALISE');
          state.request.status = 'APROVADA_MASTER';
        } else {
          throw new Error('Decisão inesperada: ' + decision);
        }
        resultado = {
          sucesso: true,
          autorizado: true,
          solicitacao: publicRequest(state),
          providerAcionado: false,
          movimentouDinheiro: false,
          transferenciaCriada: false,
          mensagem: decision === 'APROVAR'
            ? 'Solicitação aprovada no Master. Execução financeira permanece separada.'
            : 'Solicitação em análise.'
        };
      } else if (/Asaas|Provider|Transfer/i.test(method)) {
        state.providerCalls += 1;
        throw new Error('Provider não pode ser chamado neste E2E.');
      } else {
        throw new Error('Método não previsto no E2E: ' + method);
      }
    } catch (e) {
      ok = false;
      erro = e && e.message ? e.message : String(e);
    }

    const payload = JSON.stringify({
      ctMinhaCariocaPost:true,
      id,
      ok,
      resultado: ok ? resultado : null,
      erro: ok ? '' : erro
    }).replace(/</g,'\\u003c');

    await route.fulfill({
      status:200,
      contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage('+payload+', "*");<\/script></body></html>'
    });
  });
}

async function setSession(page, token) {
  await page.goto('/', { waitUntil:'domcontentloaded' });
  await page.evaluate(({storage,token}) => {
    const value = JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
    sessionStorage.setItem(storage,value);
    localStorage.setItem(storage,value);
  }, {storage:STORAGE,token});
}

test.describe('Produtor -> Master | Antecipação segura', () => {
  test.skip(!BRANCH_MODE, 'Fluxo financeiro mutável roda apenas na branch com backend simulado.');

  test('produtor solicita, Master recebe, analisa e aprova sem movimentar dinheiro', async ({ page }) => {
    const state = {
      producerToken:'CT-PROD-FIN-E2E',
      adminToken:'CT-ADMIN-FIN-E2E',
      producerProfile:'PRODUTOR_TITULAR',
      canRequest:true,
      eligibleBase:1250,
      request:null,
      requestCalls:0,
      summaryCalls:0,
      masterActions:[],
      providerCalls:0
    };

    await installMock(page,state);
    await setSession(page,state.producerToken);

    await page.goto('/produtor/financeiro/?evento='+EVENT_ID, {waitUntil:'domcontentloaded'});
    await expect(page.locator('#dashboard')).toBeVisible({timeout:15000});
    await expect(page.locator('#policyMinimum')).toContainText('500,00');
    await expect(page.locator('#policyMax')).toHaveText('80%');
    await expect(page.locator('#policyReserve')).toHaveText('20%');
    await expect(page.locator('#policyFee')).toHaveText('3,5%');
    await expect(page.locator('#policyDeadline')).toContainText('2 dias úteis');
    await expect(page.locator('#policyNormal')).toContainText('D+3 úteis');
    await expect(page.locator('#policyNormal')).toContainText('sem taxa');
    await expect(page.locator('#advanceRequestButton')).toBeEnabled();

    await page.locator('#advanceRequestButton').click();
    await expect(page.locator('#advanceBackdrop')).toBeVisible();
    await page.locator('#advanceAmount').fill('400');
    await page.locator('#advanceConfirm').click();

    await expect.poll(() => state.requestCalls).toBe(1);
    await expect.poll(() => state.request && state.request.status).toBe('SOLICITADA');
    await expect(page.locator('#message')).toContainText('enviada ao administrador para análise');
    await expect(page.locator('#pendingApprovals')).toHaveText('1');
    await expect(page.locator('#anticipationAvailable')).toContainText('600,00');

    await page.evaluate(({storage,token}) => {
      const value = JSON.stringify({token,expiraEm:'2099-01-01T00:00:00.000Z'});
      sessionStorage.setItem(storage,value);
      localStorage.setItem(storage,value);
    }, {storage:STORAGE,token:state.adminToken});

    await page.goto('/backoffice/carioca-pay/', {waitUntil:'domcontentloaded'});
    await expect(page.locator('#app')).toBeVisible({timeout:15000});
    await expect(page.locator('#kRequested')).toHaveText('1');
    await expect(page.locator('#kNotifications')).toHaveText('1');
    await expect(page.getByText('Produtor Homologação').first()).toBeVisible();

    await page.getByText('Produtor Homologação').first().click();
    await expect(page.locator('#detailStatus')).toHaveText('Solicitada');
    await expect(page.locator('#detail')).toContainText('3,50%');
    await expect(page.locator('#detail')).toContainText('não envia dinheiro');
    await expect(page.locator('#detail')).toContainText('2 dias úteis');

    await page.getByRole('button',{name:'Iniciar análise'}).click();
    await page.locator('#decisionConfirm').click();
    await expect.poll(() => state.request.status).toBe('EM_ANALISE');
    await expect(page.locator('#detailStatus')).toHaveText('Em análise',{timeout:15000});

    await page.getByRole('button',{name:'Aprovar'}).click();
    await page.locator('#decisionConfirm').click();
    await expect.poll(() => state.request.status).toBe('APROVADA_MASTER');
    await expect(page.locator('#detailStatus')).toHaveText('Aprovada Master',{timeout:15000});

    expect(state.masterActions).toEqual(['INICIAR_ANALISE','APROVAR']);
    expect(state.providerCalls).toBe(0);
  });

  test('perfil sem permissão ou base abaixo de R$ 500 não consegue solicitar', async ({ page }) => {
    const state = {
      producerToken:'CT-PROD-AUX-E2E',
      adminToken:'CT-ADMIN-FIN-E2E',
      producerProfile:'PRODUTOR_AUXILIAR',
      canRequest:false,
      eligibleBase:400,
      request:null,
      requestCalls:0,
      summaryCalls:0,
      masterActions:[],
      providerCalls:0
    };

    await installMock(page,state);
    await setSession(page,state.producerToken);
    await page.goto('/produtor/financeiro/?evento='+EVENT_ID, {waitUntil:'domcontentloaded'});

    await expect(page.locator('#dashboard')).toBeVisible({timeout:15000});
    await expect(page.locator('#policyMinimum')).toContainText('500,00');
    await expect(page.locator('#anticipationAvailable')).toContainText('0,00');
    await expect(page.locator('#advanceRequestButton')).toBeDisabled();
    expect(state.requestCalls).toBe(0);
    expect(state.providerCalls).toBe(0);
  });
});
