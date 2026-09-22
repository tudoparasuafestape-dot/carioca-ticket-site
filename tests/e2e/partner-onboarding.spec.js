import { test, expect } from '@playwright/test';

const BRANCH_MODE = String(process.env.CT_BRANCH_MODE || '') === '1';
const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

function configFixture() {
  return {
    sucesso: true,
    programa: {
      parceiroPercentual: 1,
      taxaServicoPercentual: 10,
      adesao: 0,
      mensalidade: 0,
      antecipacaoMaxPercentual: 80,
      antecipacaoTaxaMinPercentual: 2.5,
      antecipacaoAviso: 'Sujeita à análise de risco, disponibilidade de saldo, prazo, perfil do produtor/evento e condições financeiras vigentes.',
      pagamentoAutomaticoComissao: false
    },
    documentos: [
      { id:'REGULAMENTO_PARCEIRO_CT', titulo:'Regulamento do Programa de Parceiros CT', versao:'1.0-operacional-2026-09-21', url:'/parceiro/regulamento/', obrigatorio:true, revisaoJuridicaPendente:true },
      { id:'CODIGO_CONDUTA', titulo:'Código de Conduta', versao:'1.0-revisao-2026-09-20', url:'/parceiro/conduta/', obrigatorio:true, revisaoJuridicaPendente:true },
      { id:'POLITICA_PRIVACIDADE', titulo:'Política de Privacidade', versao:'1.0-2026-09-20', url:'/privacidade/', obrigatorio:true, revisaoJuridicaPendente:false },
      { id:'REGRAS_COMERCIAIS', titulo:'Regras comerciais', versao:'2026.09.22', url:'/parceiro/programa/#condicoes', obrigatorio:true, revisaoJuridicaPendente:false },
      { id:'TRATAMENTO_DADOS_PROGRAMA', titulo:'Tratamento de dados', versao:'2026.09.22', url:'/privacidade/', obrigatorio:true, revisaoJuridicaPendente:false }
    ],
    materiais: [
      { id:'TABELA_COMERCIAL', titulo:'Tabela Comercial para Produtores', descricao:'Condição comercial oficial.', url:'/parceiro/programa/#condicoes', tipo:'COMERCIAL', versao:'2026' },
      { id:'REGULAMENTO', titulo:'Regulamento do Programa', descricao:'Regras do programa.', url:'/parceiro/regulamento/', tipo:'DOCUMENTO', versao:'1.0' }
    ],
    urls: { portal:'/parceiro/', programa:'/parceiro/programa/', ativacao:'/parceiro/ativar/' }
  };
}

function adminListFixture(status='ENVIADO') {
  return {
    sucesso:true, autorizado:true,
    admin:{ nome:'Administrador Homologação', perfil:'ADMINISTRADOR' },
    contagem:{ ENVIADO:status==='ENVIADO'?1:0, EM_ANALISE:status==='EM_ANALISE'?1:0, PENDENCIA:0, APROVADO:status==='APROVADO'?1:0, ATIVO:0 },
    itens:[{
      solicitacaoId:'PCTSOL-E2E', protocolo:'PCT-20260922-E2E',
      status, nome:'Parceiro Homologação', email:'parceiro@example.invalid',
      cidade:'Jaboatão dos Guararapes', uf:'PE', empresaMarca:'Marca E2E',
      criadoEm:'22/09/2026 01:00', atualizadoEm:'22/09/2026 01:00'
    }]
  };
}

function adminDetailFixture(status='ENVIADO') {
  return {
    sucesso:true, autorizado:true,
    solicitacao:{
      solicitacaoId:'PCTSOL-E2E', protocolo:'PCT-20260922-E2E', status,
      nome:'Parceiro Homologação', cpfMascarado:'529.***.***-25',
      dataNascimento:'1990-01-01', whatsapp:'81999990000',
      email:'parceiro@example.invalid', cidade:'Jaboatão dos Guararapes', uf:'PE',
      empresaMarca:'Marca E2E', cnpjMascarado:'', areaAtuacao:'Eventos',
      redeProfissional:'@parceiroe2e', comoConheceu:'Indicação',
      experienciaEventos:'Produção', sobreAtuacao:'Atuação em eventos',
      observacaoInterna:'', pendenciaPublica:'', usuarioId:'', parceiroId:'',
      codigoIndicacao:'', criadoEm:'22/09/2026 01:00', aprovadoEm:'', ativadoEm:''
    },
    aceites:[
      { documentoId:'REGULAMENTO_PARCEIRO_CT', versao:'1.0-operacional-2026-09-21', aceito:true, dataHora:'22/09/2026 01:00', url:'/parceiro/regulamento/' }
    ],
    historico:[
      { antes:'', depois:'ENVIADO', usuarioId:'PUBLICO', perfil:'CANDIDATO_PARCEIRO', justificativa:'', criadoEm:'22/09/2026 01:00' }
    ]
  };
}

async function installRpcMock(page, state) {
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const params = new URLSearchParams(request.postData() || '');
    const requestId = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    const method = String(params.get('metodo') || '');
    let args = [];
    try { args = JSON.parse(params.get('argsJson') || '[]'); } catch (_) {}
    let resultado = null, ok = true, erro = '';

    try {
      if (action === 'publicRpc') {
        if (method === 'ctParceiroOnboardingConfigPublicaPROD') {
          resultado = configFixture();
        } else if (method === 'ctParceiroOnboardingEnviarSolicitacaoPROD') {
          state.submitCalls += 1;
          const payload = args[0] || {};
          state.lastSubmit = payload;
          if (String(payload.email || '').includes('duplicado')) {
            resultado = { sucesso:true, enviado:true, duplicada:false, codigo:'SOLICITACAO_RECEBIDA', protocolo:'', mensagem:'Recebemos seus dados. Se já existir uma solicitação em andamento, ela continuará válida.' };
          } else {
            resultado = { sucesso:true, enviado:true, duplicada:false, protocolo:'PCT-20260922-E2E', mensagem:'Cadastro recebido.' };
          }
        } else if (method === 'ctParceiroOnboardingConsultarAtivacaoPROD') {
          resultado = { sucesso:true, valida:false, codigo:'ATIVACAO_INVALIDA_OU_UTILIZADA' };
        } else {
          throw new Error('Método público não previsto no E2E: ' + method);
        }
      } else if (action === 'portalRpc') {
        if (method === 'ctProdutorOnboardingAdminContarPendentesPROD') {
          expect(String(args[0] || '')).toBe(state.token);
          state.producerBadgeCalls=(state.producerBadgeCalls||0)+1;
          resultado = {sucesso:true,autorizado:true,total:1,contagem:{ENVIADO:1,EM_ANALISE:0,PENDENCIA:0}};

        } else if (method === 'ctParceiroOnboardingAdminListarPROD') {
          expect(String(args[0] || '')).toBe(state.token);
          resultado = adminListFixture(state.adminStatus || 'ENVIADO');
        } else if (method === 'ctParceiroOnboardingAdminDetalharPROD') {
          expect(String(args[0] || '')).toBe(state.token);
          resultado = adminDetailFixture(state.adminStatus || 'ENVIADO');
        } else if (method === 'ctParceiroOnboardingAdminDecidirPROD') {
          expect(String(args[0] || '')).toBe(state.token);
          state.adminActions += 1;
          state.adminStatus = 'APROVADO';
          resultado = {
            sucesso:true, jaProcessada:false, solicitacaoId:'PCTSOL-E2E',
            resultado:{
              status:'APROVADO', usuarioId:'USR-E2E', parceiroId:'PCT-E2E',
              codigoIndicacao:'CTE2E2026',
              linkIndicacao:'https://cariocaticket.com.br/produtor/?ref=CTE2E2026',
              ativacao:{ url:'https://cariocaticket.com.br/parceiro/ativar/?token=TOKEN-E2E-VALIDO', expiraEm:'2099-01-01T00:00:00.000Z' },
              notificacaoAutomaticaEnviada:false
            }
          };
        } else {
          throw new Error('Método admin não previsto no E2E: ' + method);
        }
      } else {
        throw new Error('Ação não prevista: ' + action);
      }
    } catch (e) {
      ok = false; erro = e && e.message ? e.message : String(e);
    }

    const payload = JSON.stringify({
      ctMinhaCariocaPost:true, id:requestId, ok,
      resultado: ok ? resultado : null,
      erro: ok ? '' : erro
    }).replace(/</g, '\\u003c');

    await route.fulfill({
      status:200, contentType:'text/html; charset=utf-8',
      body:'<!doctype html><html><body><script>window.top.postMessage(' + payload + ', "*");<\/script></body></html>'
    });
  });
}

async function fillStepOne(page, email='parceiro@example.invalid') {
  await page.locator('#fName').fill('Parceiro Homologação');
  await page.locator('#fCpf').fill('52998224725');
  await page.locator('#fPhone').fill('81999990000');
  await page.locator('#fEmail').fill(email);
  await page.locator('#fCity').fill('Jaboatão dos Guararapes');
  await page.locator('#fUf').selectOption('PE');
  await page.locator('#nextStep').click();
}

async function fillStepTwo(page) {
  await page.locator('#fArea').fill('Produção de eventos');
  await page.locator('#fAbout').fill('Atuo com relacionamento e produção de eventos em Pernambuco.');
  await page.locator('#nextStep').click();
}

test.describe('Programa Parceiro CT', () => {
  test.skip(!BRANCH_MODE, 'Fluxo mutável roda na branch com backend simulado.');

  test('pagina publica apresenta programa e preserva Portal Parceiro existente', async ({ page }) => {
    const state={ submitCalls:0, adminActions:0, token:'CT-E2E-ADMIN', producerBadgeCalls:0 };
    await installRpcMock(page,state);
    await page.goto('/parceiro/programa/', { waitUntil:'domcontentloaded' });
    await expect(page.getByRole('heading', { name:/Indique produtores/i })).toBeVisible();
    await expect(page.locator('#heroCommission')).toHaveText('1');
    await expect(page.locator('#serviceFee')).toHaveText('10');
    await expect(page.locator('#anticipationMax')).toHaveText('80');
    await expect(page.locator('#anticipationFee')).toHaveText('2,5');
    await expect(page.getByRole('link', { name:/Já sou parceiro/i }).first()).toHaveAttribute('href','/parceiro/');
    await expect(page.locator('#materialsGrid')).toContainText('Tabela Comercial para Produtores');

    await page.goto('/parceiro/', { waitUntil:'domcontentloaded' });
    await expect(page.getByRole('heading', { name:/Seu resultado em um só lugar/i })).toBeVisible();
    await expect(page.getByRole('link', { name:/Conheça o programa/i })).toHaveAttribute('href','/parceiro/programa/');
  });

  test('fluxo feliz envia cadastro com aceites versionados e mostra protocolo', async ({ page }) => {
    const state={ submitCalls:0, adminActions:0, token:'CT-E2E-ADMIN', lastSubmit:null };
    await installRpcMock(page,state);
    await page.goto('/parceiro/programa/', { waitUntil:'domcontentloaded' });
    await expect(page.locator('#heroCommission')).toHaveText('1');
    await page.getByRole('button', { name:'Quero ser Parceiro CT' }).first().click();
    await fillStepOne(page);
    await fillStepTwo(page);
    const checks=page.locator('.accept-check');
    await expect(checks).toHaveCount(5);
    for(let i=0;i<5;i++) await checks.nth(i).check();
    await page.locator('#submitForm').click();
    await expect(page.locator('#successArea')).toBeVisible({ timeout:15000 });
    await expect(page.locator('#protocol')).toContainText('PCT-20260922-E2E');
    expect(state.submitCalls).toBe(1);
    expect(state.lastSubmit.aceites).toHaveLength(5);
    expect(state.lastSubmit.aceites.every(x => x.aceito === true && x.versao)).toBe(true);
    expect(state.lastSubmit).not.toHaveProperty('percentual');
  });

  test('nao envia sem todos os aceites', async ({ page }) => {
    const state={ submitCalls:0, adminActions:0, token:'CT-E2E-ADMIN' };
    await installRpcMock(page,state);
    await page.goto('/parceiro/programa/', { waitUntil:'domcontentloaded' });
    await expect(page.locator('#heroCommission')).toHaveText('1');
    await page.getByRole('button', { name:'Quero ser Parceiro CT' }).first().click();
    await fillStepOne(page);
    await fillStepTwo(page);
    await page.locator('.accept-check').first().check();
    await page.locator('#submitForm').click();
    await expect(page.locator('#formMessage')).toContainText('todos os aceites obrigatórios');
    expect(state.submitCalls).toBe(0);
  });

  test('duplicidade nao cria nova solicitacao silenciosamente', async ({ page }) => {
    const state={ submitCalls:0, adminActions:0, token:'CT-E2E-ADMIN' };
    await installRpcMock(page,state);
    await page.goto('/parceiro/programa/', { waitUntil:'domcontentloaded' });
    await expect(page.locator('#heroCommission')).toHaveText('1');
    await page.getByRole('button', { name:'Quero ser Parceiro CT' }).first().click();
    await fillStepOne(page,'duplicado@example.invalid');
    await fillStepTwo(page);
    const checks=page.locator('.accept-check');
    for(let i=0;i<5;i++) await checks.nth(i).check();
    await page.locator('#submitForm').click();
    await expect(page.locator('#successArea')).toBeVisible({ timeout:15000 });
    await expect(page.locator('#protocol')).toHaveText('Solicitação recebida com segurança.');
    await expect(page.locator('body')).not.toContainText(/já existe uma solicitação|cadastro ativo com os dados/i);
    expect(state.submitCalls).toBe(1);
  });

  test('os tres ultimos termos abrem dentro do cadastro e preservam tudo', async ({ page }) => {
    const state={ submitCalls:0, adminActions:0, token:'CT-E2E-ADMIN' };
    await installRpcMock(page,state);
    await page.goto('/parceiro/programa/', { waitUntil:'domcontentloaded' });
    await expect(page.locator('#heroCommission')).toHaveText('1');
    await page.getByRole('button', { name:'Quero ser Parceiro CT' }).first().click();
    await fillStepOne(page);
    await fillStepTwo(page);

    await page.locator('.accept-check').first().check();
    const originalUrl=page.url();

    const links=[
      { name:'Política de Privacidade', frame:/\/privacidade\// },
      { name:'Regras comerciais', frame:/\/parceiro\/regras-comerciais\// },
      { name:'Tratamento de dados', frame:/\/parceiro\/tratamento-dados\// }
    ];

    for (const item of links) {
      await page.getByRole('link', { name:item.name }).click();
      await expect(page.locator('#legalViewerBackdrop')).toBeVisible();
      await expect(page).toHaveURL(originalUrl);
      await expect(page.locator('#legalViewerFrame')).toHaveAttribute('src',item.frame);
      await page.getByRole('button', { name:'← Voltar ao cadastro' }).click();
      await expect(page.locator('#legalViewerBackdrop')).toBeHidden();
      await expect(page.locator('#applyBackdrop')).toBeVisible();
      await expect(page.locator('.form-step[data-step="2"]')).toBeVisible();
      await expect(page.locator('#fName')).toHaveValue('Parceiro Homologação');
      await expect(page.locator('#fEmail')).toHaveValue('parceiro@example.invalid');
      await expect(page.locator('#fAbout')).toHaveValue('Atuo com relacionamento e produção de eventos em Pernambuco.');
      await expect(page.locator('.accept-check').first()).toBeChecked();
    }
    expect(state.submitCalls).toBe(0);
  });

  test('backoffice exige sessao e fluxo de aprovacao usa RPC administrativo', async ({ page }) => {
    const state={ submitCalls:0, adminActions:0, token:'CT-E2E-ADMIN' };
    await installRpcMock(page,state);

    await page.goto('/parceiro/admin/', { waitUntil:'domcontentloaded' });
    await expect(page.locator('#gateDenied')).toBeVisible();

    await page.goto('/', { waitUntil:'domcontentloaded' });
    await page.evaluate(({key,token}) => {
      localStorage.setItem(key, JSON.stringify({ token, expiraEm:'2099-01-01T00:00:00.000Z' }));
      sessionStorage.setItem(key, JSON.stringify({ token, expiraEm:'2099-01-01T00:00:00.000Z' }));
    }, { key:STORAGE, token:state.token });

    await page.goto('/parceiro/admin/', { waitUntil:'domcontentloaded' });
    await expect(page.locator('#app')).toBeVisible({ timeout:15000 });
    await expect(page.locator('#producerRequestsBadge')).toBeVisible({ timeout:15000 });
    await expect(page.locator('#producerRequestsBadge')).toHaveText('1');
    await expect.poll(() => state.producerBadgeCalls).toBeGreaterThan(0);
    await expect(page.locator('#list')).toContainText('Parceiro Homologação');
    await page.locator('.item').first().click();
    await expect(page.locator('#detail')).toContainText('529.***.***-25');
    await expect(page.locator('#detail')).toContainText('Aceites versionados');
    await page.getByRole('button', { name:'Aprovar' }).click();
    await expect(page.locator('#actionBackdrop')).toBeVisible();
    let clipboardCalls=0;
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable:true,
        value:{ writeText:async () => { window.__clipboardCalls=(window.__clipboardCalls||0)+1; } }
      });
    });
    await page.locator('#confirmAction').click();
    await expect.poll(() => state.adminActions).toBe(1);
    await expect(page.locator('#actionBackdrop')).toBeHidden({ timeout:15000 });
    await expect(page.locator('#cApproved')).toHaveText('1');
    await expect(page.locator('#detailStatus')).toHaveText('APROVADO');
    await expect(page.locator('#activationBackdrop')).toBeVisible();
    clipboardCalls = await page.evaluate(() => window.__clipboardCalls||0);
    expect(clipboardCalls).toBe(0);
    await page.locator('#copyActivation').click();
    await expect.poll(async () => page.evaluate(() => window.__clipboardCalls||0)).toBe(1);
  });

  test('ativacao com token invalido permanece bloqueada', async ({ page }) => {
    const state={ submitCalls:0, adminActions:0, token:'CT-E2E-ADMIN' };
    await installRpcMock(page,state);
    await page.goto('/parceiro/ativar/?token=TOKEN-INVALIDO', { waitUntil:'domcontentloaded' });
    await expect(page.locator('#invalid')).toBeVisible({ timeout:15000 });
    await expect(page.locator('#activate')).toBeHidden();
  });
});
